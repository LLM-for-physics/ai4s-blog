import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import { fail, studentId } from "./security.js";
import { hasUncertainDeployment } from "./db.js";
export const HEADERS = ["学号", "姓名", "服务器号"];
function csvRows(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push(row);
        row = [];
      }
    } else {
      if (closed || c === '"') fail("INVALID_ROSTER", "CSV 引号格式错误");
      cell += c;
    }
    if (cell.length > 10_000 || row.length > 20 || rows.length > 2001)
      fail("INVALID_ROSTER", "名单超出行数、列数或单元格长度限制");
  }
  if (quoted) fail("INVALID_ROSTER", "CSV 引号未闭合");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function checkZip(buffer) {
  const maxEntry = 8 * 1024 * 1024,
    maxTotal = 16 * 1024 * 1024;
  const invalid = (message = "XLSX 压缩结构不受支持") =>
    fail("INVALID_ROSTER", message);
  let eocd = -1;
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65557);
    offset--
  ) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) invalid("无效的 XLSX 文件");
  const count = buffer.readUInt16LE(eocd + 10),
    size = buffer.readUInt32LE(eocd + 12),
    centralStart = buffer.readUInt32LE(eocd + 16);
  if (
    !count ||
    count > 2048 ||
    centralStart + size !== eocd ||
    buffer.readUInt16LE(eocd + 4) ||
    buffer.readUInt16LE(eocd + 6) ||
    buffer.readUInt16LE(eocd + 8) !== count
  )
    invalid();
  let cursor = centralStart,
    total = 0;
  const names = new Set(),
    ranges = [];
  function extraFields(start, length) {
    const end = start + length;
    for (let p = start; p < end;) {
      if (p + 4 > end) invalid();
      const kind = buffer.readUInt16LE(p),
        bytes = buffer.readUInt16LE(p + 2);
      // ZIP64 and alternate Unicode names can change which bytes/names JSZip reads.
      if (kind === 0x0001 || kind === 0x7075 || p + 4 + bytes > end) invalid();
      p += 4 + bytes;
    }
  }
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== 0x02014b50)
      invalid();
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      crc = buffer.readUInt32LE(cursor + 16);
    const packed = buffer.readUInt32LE(cursor + 20),
      declared = buffer.readUInt32LE(cursor + 24),
      nameLength = buffer.readUInt16LE(cursor + 28),
      extraLength = buffer.readUInt16LE(cursor + 30),
      commentLength = buffer.readUInt16LE(cursor + 32),
      local = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > eocd ||
      !nameLength ||
      flags & ~0x080e ||
      ![0, 8].includes(method) ||
      buffer.readUInt16LE(cursor + 34) ||
      packed === 0xffffffff ||
      declared > maxEntry ||
      declared > maxTotal - total ||
      local + 30 > centralStart
    )
      invalid("XLSX 成员超出大小限制或使用不支持的压缩格式");
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    let name;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      invalid();
    }
    if (
      !name ||
      /[\\\x00-\x1f]/.test(name) ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === "." || part === "..") ||
      names.has(name)
    )
      invalid("XLSX 包含重复或不安全的成员路径");
    names.add(name);
    extraFields(cursor + 46 + nameLength, extraLength);
    if (
      buffer.readUInt32LE(local) !== 0x04034b50 ||
      buffer.readUInt16LE(local + 6) !== flags ||
      buffer.readUInt16LE(local + 8) !== method
    )
      invalid();
    const localNameLength = buffer.readUInt16LE(local + 26),
      localExtraLength = buffer.readUInt16LE(local + 28),
      dataStart = local + 30 + localNameLength + localExtraLength,
      dataEnd = dataStart + packed;
    if (
      localNameLength !== nameLength ||
      dataEnd > centralStart ||
      !buffer
        .subarray(local + 30, local + 30 + localNameLength)
        .equals(nameBytes)
    )
      invalid();
    extraFields(local + 30 + localNameLength, localExtraLength);
    for (const [field, expected] of [
      [14, crc],
      [18, packed],
      [22, declared],
    ]) {
      const actual = buffer.readUInt32LE(local + field);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) invalid();
    }
    let memberEnd = dataEnd;
    if (flags & 8) {
      if (memberEnd + 12 > centralStart) invalid();
      if (buffer.readUInt32LE(memberEnd) === 0x08074b50) memberEnd += 4;
      if (
        memberEnd + 12 > centralStart ||
        buffer.readUInt32LE(memberEnd) !== crc ||
        buffer.readUInt32LE(memberEnd + 4) !== packed ||
        buffer.readUInt32LE(memberEnd + 8) !== declared
      )
        invalid();
      memberEnd += 12;
    }
    ranges.push([local, memberEnd]);
    let actualSize;
    if (method === 0) actualSize = packed;
    else {
      try {
        const result = inflateRawSync(buffer.subarray(dataStart, dataEnd), {
          maxOutputLength: Math.max(1, Math.min(maxEntry, maxTotal - total)),
          info: true,
        });
        if (result.engine.bytesWritten !== packed)
          invalid("XLSX 压缩数据包含多余内容");
        actualSize = result.buffer.length;
      } catch {
        invalid("XLSX 实际解压大小超限或压缩数据无效");
      }
    }
    if (
      actualSize !== declared ||
      actualSize > maxEntry ||
      actualSize > maxTotal - total
    )
      invalid("XLSX 实际解压大小与声明不符或超出限制");
    total += actualSize;
    cursor = next;
  }
  if (cursor !== eocd) invalid();
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i][0] < ranges[i - 1][1]) invalid("XLSX 成员数据范围重叠");
}
export async function parseRoster(bytes, filename, config, db) {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    fail("INVALID_ROSTER_SIZE", "名单文件最大 2 MiB");
  let table;
  if (/\.xlsx$/i.test(filename)) {
    checkZip(bytes);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bytes);
    } catch {
      fail("INVALID_ROSTER", "无法读取 XLSX 文件");
    }
    if (wb.worksheets.length !== 1)
      fail("INVALID_ROSTER", "名单必须只有一个工作表");
    const sheet = wb.worksheets[0];
    if (sheet.rowCount > 2001 || sheet.columnCount > 20)
      fail("INVALID_ROSTER", "名单最多 2000 位学生、20 列");
    table = [];
    for (let n = 1; n <= sheet.rowCount; n++)
      table.push(sheet.getRow(n).values.slice(1));
  } else if (/\.csv$/i.test(filename)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("INVALID_ROSTER", "CSV 必须使用 UTF-8 编码");
    }
    table = csvRows(text.replace(/^\uFEFF/, ""));
  } else fail("INVALID_ROSTER", "请上传 XLSX 或 UTF-8 CSV 名单");
  const aliases = {
    学号: "studentId",
    studentId: "studentId",
    姓名: "name",
    name: "name",
    邮箱: "email",
    学校邮箱: "email",
    email: "email",
    服务器账号: "username",
    username: "username",
    服务器: "serverId",
    服务器号: "serverId",
    serverId: "serverId",
  };
  const headers = (table.shift() || []).map((h) =>
    Object.hasOwn(aliases, String(h || "").trim())
      ? aliases[String(h || "").trim()]
      : undefined,
  );
  if (
    !headers.includes("studentId") ||
    !headers.includes("name") ||
    !headers.includes("serverId") ||
    headers.some((x) => !x) ||
    new Set(headers).size !== headers.length
  )
    fail(
      "INVALID_ROSTER_HEADERS",
      "表头必须包含学号、姓名、服务器号，且只能使用模板中的唯一列名",
    );
  const errors = [],
    rows = [],
    seen = new Set();
  for (const [index, values] of table.entries()) {
    if (values.every((v) => v === undefined || v === null || v === ""))
      continue;
    const rowNo = index + 2;
    const data = Object.fromEntries(
      headers.map((h, i) => [h, values[i] ?? ""]),
    );
    const err = (field, message) => errors.push({ row: rowNo, field, message });
    if (typeof data.studentId !== "string") {
      err(
        "studentId",
        "学号必须为文本；数字单元格可能丢失前导零，请按模板重新填写",
      );
      continue;
    }
    data.studentId = data.studentId.trim();
    try {
      studentId(data.studentId);
    } catch (e) {
      err("studentId", e.message);
      continue;
    }
    if (seen.has(data.studentId)) err("studentId", "名单中学号重复");
    seen.add(data.studentId);
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 100 ||
      /[\x00-\x1f]/.test(data.name)
    )
      err("name", "姓名须为 1 至 100 字符的普通文本");
    const expectedEmail = `${data.studentId}@${config.studentEmailDomain}`;
    if (
      data.email &&
      (typeof data.email !== "string" ||
        data.email.trim().toLowerCase() !== expectedEmail)
    )
      err("email", "邮箱必须与学号对应的学校邮箱一致");
    const username = "stu" + data.studentId;
    if (data.username && data.username !== username)
      err("username", "服务器账号必须为 stu 加原始学号");
    const serverId = ["string", "number"].includes(typeof data.serverId)
      ? String(data.serverId).trim()
      : "";
    if (!serverId || !config.servers.some((server) => server.id === serverId))
      err("serverId", "服务器号必填，且只能选择 132、190、197");
    const old = db
      .prepare("SELECT * FROM students WHERE student_id=?")
      .get(data.studentId);
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (old?.removed_at)
      err(
        "studentId",
        "该学号已移除，请先在已移除名单中明确恢复；重新导入不会自动恢复",
      );
    const targetChanged = Boolean(
      old && (old.server_id !== serverId || old.username !== username),
    );
    if (
      targetChanged &&
      (old.installed_key_id ||
        db
          .prepare(
            "SELECT 1 FROM batch_items WHERE student_id=? AND status IN ('queued','running') LIMIT 1",
          )
          .get(data.studentId) ||
        hasUncertainDeployment(db, data.studentId))
    )
      err(
        "serverId",
        "该学生仍有已安装公钥、未完成任务或未核对的导入结果，请先撤销并完成核验后再更换服务器",
      );
    rows.push({
      studentId: data.studentId,
      name,
      email: expectedEmail,
      username,
      serverId,
      change: !old
        ? "add"
        : old.name !== name || targetChanged
          ? "update"
          : "unchanged",
      baseRevision: old?.revision ?? null,
    });
  }
  if (!rows.length)
    errors.push({ row: 0, field: "file", message: "名单至少需要一名学生" });
  if (
    rows.length +
      db
        .prepare("SELECT count(*) AS n FROM students WHERE removed_at IS NULL")
        .get().n -
      rows.filter((r) => r.baseRevision !== null).length >
    2000
  )
    errors.push({
      row: 0,
      field: "file",
      message: "课程名单总人数不能超过 2000",
    });
  return {
    rows,
    errors,
    summary: {
      total: rows.length,
      added: rows.filter((x) => x.change === "add").length,
      updated: rows.filter((x) => x.change === "update").length,
      unchanged: rows.filter((x) => x.change === "unchanged").length,
    },
  };
}
export async function workbookBuffer(columns, rows) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("课程公钥");
  sheet.columns = columns.map((header, i) => ({
    header,
    key: String(i),
    width: i === columns.length - 1 ? 80 : 22,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const values of rows) {
    const row = sheet.addRow(values.map((x) => (x == null ? "" : String(x))));
    row.eachCell((cell) => {
      cell.numFmt = "@";
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
