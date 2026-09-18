import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { deflateRawSync } from "node:zlib";
import sshpk from "sshpk";
import ExcelJS from "exceljs";
import { publicKey, safeEqual } from "../src/security.js";
import { openDatabase } from "../src/db.js";
import { parseRoster, workbookBuffer } from "../src/roster.js";
import { edKey } from "./helpers.js";
const config = {
  studentEmailDomain: "stu.pku.edu.cn",
  serverId: "190",
  servers: ["132", "190", "197"].map((id) => ({ id, label: id })),
};
test("strict public-key parsing preserves fingerprint but removes user comments", () => {
  const { key } = edKey();
  const plain = publicKey(key);
  for (const ending of ["", "\n", "\r\n"]) {
    assert.deepEqual(
      publicKey(key + " unsafe-comment <script> =SUM(A1)" + ending),
      plain,
    );
  }
  assert.equal(plain.algorithm, "Ed25519");
  assert.equal(plain.bits, 256);
  assert.match(plain.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
});
test("reject private material, options, multiline, mismatched encoding and size", () => {
  const { key, pair } = edKey();
  const invalid = [
    pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret",
    "PuTTY-User-Key-File-3: ssh-ed25519",
    'command="touch /tmp/no" ' + key,
    key + "\n" + key,
    key.replace("ssh-ed25519", "ssh-rsa"),
    key + "\0",
    key + "\n\n",
    Buffer.alloc(4097),
    Buffer.from([0xff, 0xfe]),
    "ssh-ed25519 !!!!",
    key + "====",
  ];
  for (const value of invalid)
    assert.throws(
      () => publicKey(value),
      undefined,
      String(value).slice(0, 60),
    );
});
test("RSA requires canonical odd parameters and at least 3072 bits", () => {
  for (const size of [2048, 3072]) {
    const pair = crypto.generateKeyPairSync("rsa", { modulusLength: size });
    const ssh = sshpk
      .parseKey(pair.publicKey.export({ type: "spki", format: "pem" }), "pem")
      .toString("ssh");
    if (size === 2048)
      assert.throws(
        () => publicKey(ssh),
        (e) => e.code === "WEAK_KEY",
      );
    else assert.equal(publicKey(ssh).bits, 3072);
  }
});
test("CSRF comparison safely rejects unicode with equal character length", () => {
  assert.equal(safeEqual("a".repeat(43), "界".repeat(43)), false);
  assert.equal(safeEqual(undefined, "a"), false);
  assert.equal(safeEqual("valid", "valid"), true);
});
test("roster preserves zero-prefixed identifiers and reports duplicates without mutation", async () => {
  const db = openDatabase(":memory:");
  try {
    const result = await parseRoster(
      Buffer.from("学号,姓名,服务器号\n0012345678,甲,190\n0012345678,乙,132"),
      "students.csv",
      config,
      db,
    );
    assert.equal(result.rows[0].studentId, "0012345678");
    assert.equal(result.rows[0].email, "0012345678@stu.pku.edu.cn");
    assert.ok(result.errors.some((e) => e.field === "studentId"));
    assert.equal(db.prepare("SELECT count(*) AS n FROM students").get().n, 0);
  } finally {
    db.close();
  }
});
test("XLSX numeric student identifiers and formula cells are rejected", async () => {
  const db = openDatabase(":memory:");
  try {
    const wb = new ExcelJS.Workbook(),
      sheet = wb.addWorksheet("名单");
    sheet.addRow(["学号", "姓名", "服务器号"]);
    sheet.addRow([12345678, "甲", "190"]);
    sheet.addRow(["0012345679", { formula: "1+1", result: 2 }, "132"]);
    const result = await parseRoster(
      Buffer.from(await wb.xlsx.writeBuffer()),
      "students.xlsx",
      config,
      db,
    );
    assert.ok(result.errors.some((e) => e.field === "studentId"));
    assert.ok(result.errors.some((e) => e.field === "name"));
  } finally {
    db.close();
  }
});
test("Excel export uses literal text for formula triggers and full keys", async () => {
  const key = edKey().key,
    bytes = await workbookBuffer(
      ["学号", "姓名", "公钥"],
      [["0012345678", '=HYPERLINK("http://example.invalid")', key]],
    ),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.equal(wb.worksheets[0].getCell("A2").value, "0012345678");
  assert.equal(wb.worksheets[0].getCell("B2").type, ExcelJS.ValueType.String);
  assert.equal(wb.worksheets[0].getCell("C2").value, key);
});
function syntheticZip(members) {
  const localParts = [],
    centralParts = [];
  let localOffset = 0;
  for (const member of members) {
    const name = Buffer.from(member.name || "xl/worksheets/sheet1.xml"),
      localName = Buffer.from(
        member.localName || member.name || "xl/worksheets/sheet1.xml",
      ),
      data = Buffer.from(member.data),
      compressed = deflateRawSync(data),
      declared = member.declared ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declared, 22);
    local.writeUInt16LE(localName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declared, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    const entry = Buffer.concat([local, localName, compressed]);
    localParts.push(entry);
    centralParts.push(central, name);
    localOffset += entry.length;
  }
  const central = Buffer.concat(centralParts),
    eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}
test("XLSX rejects forged decompressed sizes before ExcelJS and enforces the actual output bound", async () => {
  const db = openDatabase(":memory:");
  try {
    const falseSize = syntheticZip([
      { data: Buffer.alloc(1024 * 1024, 65), declared: 1 },
    ]);
    await assert.rejects(
      () => parseRoster(falseSize, "forged.xlsx", config, db),
      (e) => e.code === "INVALID_ROSTER" && e.message.includes("实际解压大小"),
    );
    const bomb = syntheticZip([
      { data: Buffer.alloc(8 * 1024 * 1024 + 1, 65), declared: 1 },
    ]);
    assert.ok(bomb.length < 16 * 1024);
    await assert.rejects(
      () => parseRoster(bomb, "bounded.xlsx", config, db),
      (e) =>
        e.code === "INVALID_ROSTER" && e.message.includes("实际解压大小超限"),
    );
  } finally {
    db.close();
  }
});
test("XLSX rejects duplicate or inconsistent local and central member names", async () => {
  const db = openDatabase(":memory:");
  try {
    const duplicate = syntheticZip([
      { name: "xl/a.xml", data: "a" },
      { name: "xl/a.xml", data: "b" },
    ]);
    await assert.rejects(
      () => parseRoster(duplicate, "duplicate.xlsx", config, db),
      (e) => e.code === "INVALID_ROSTER" && e.message.includes("重复"),
    );
    const mismatch = syntheticZip([
      { name: "xl/a.xml", localName: "xl/b.xml", data: "a" },
    ]);
    await assert.rejects(
      () => parseRoster(mismatch, "mismatch.xlsx", config, db),
      (e) => e.code === "INVALID_ROSTER" && e.message !== "无法读取 XLSX 文件",
    );
  } finally {
    db.close();
  }
});
test("rosters require an explicit allowed server and always derive stu usernames from text student IDs", async () => {
  const db = openDatabase(":memory:");
  try {
    await assert.rejects(
      () =>
        parseRoster(
          Buffer.from("学号,姓名\n0012345678,甲"),
          "missing-column.csv",
          config,
          db,
        ),
      (e) => e.code === "INVALID_ROSTER_HEADERS",
    );
    for (const server of ["", "fyl190", "999", "https://example.invalid"]) {
      const result = await parseRoster(
        Buffer.from(`学号,姓名,服务器号\n0012345678,甲,${server}`),
        "bad-server.csv",
        config,
        db,
      );
      assert.ok(result.errors.some((e) => e.field === "serverId"));
    }
    for (const server of ["132", "190", "197"]) {
      const result = await parseRoster(
        Buffer.from(`学号,姓名,服务器号\n0012345678,甲,${server}`),
        "valid.csv",
        config,
        db,
      );
      assert.deepEqual(result.errors, []);
      assert.equal(result.rows[0].username, "stu0012345678");
      assert.equal(result.rows[0].serverId, server);
      assert.equal(result.rows[0].email, "0012345678@stu.pku.edu.cn");
    }
  } finally {
    db.close();
  }
});
test("Excel numeric server labels are accepted while the student identifier stays literal text", async () => {
  const db = openDatabase(":memory:");
  try {
    const wb = new ExcelJS.Workbook(),
      sheet = wb.addWorksheet("名单");
    sheet.addRow(["学号", "姓名", "服务器号"]);
    sheet.addRow(["0012345678", "甲", 132]);
    const result = await parseRoster(
      Buffer.from(await wb.xlsx.writeBuffer()),
      "valid.xlsx",
      config,
      db,
    );
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0].studentId, "0012345678");
    assert.equal(result.rows[0].serverId, "132");
  } finally {
    db.close();
  }
});
