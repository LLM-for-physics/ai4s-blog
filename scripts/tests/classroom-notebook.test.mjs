import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { renderNotebook, renderClassroomNotebook, codeFence, multiline, repoRoot, notebookFile, pageFile, assetDirectory } from '../render-classroom-notebook.mjs'

const savedNotebook = JSON.parse(await readFile(path.join(repoRoot, notebookFile), 'utf8'))
const notebook = cells => ({ nbformat: 4, nbformat_minor: 2, cells })
const codeCell = (source, outputs = [], execution_count = 1) => ({ cell_type: 'code', source, outputs, execution_count })
const hash = value => createHash('sha256').update(value).digest('hex')

test('actual notebook retains prose, all code, execution numbers and text outputs in cell order', () => {
  const rendered = renderNotebook(savedNotebook)
  assert.deepEqual(rendered.stats, { markdownCells: 4, codeCells: 15, skippedEmptyCells: 2, outputs: 11, images: 3 })
  let previous = -1
  savedNotebook.cells.forEach((cell, index) => {
    const source = multiline(cell.source)
    if (cell.cell_type === 'code' && !source.trim() && !cell.outputs.length) {
      assert.ok(!rendered.markdown.includes('<!-- notebook-cell: ' + (index + 1) + ' -->'))
      return
    }
    const marker = rendered.markdown.indexOf('<!-- notebook-cell: ' + (index + 1) + ' -->')
    assert.ok(marker > previous, 'cell ' + (index + 1) + ' is retained in order')
    previous = marker
    if (cell.cell_type === 'markdown') {
      assert.ok(rendered.markdown.includes(source.replace(/^# /gm, '## ')), 'Markdown content retained')
      return
    }
    assert.ok(rendered.markdown.includes(codeFence(source, 'python')), 'Python source retained verbatim')
    assert.ok(rendered.markdown.includes('In [' + cell.execution_count + ']'), 'saved execution count retained')
    for (const output of cell.outputs) {
      const text = output.output_type === 'stream' ? multiline(output.text) : output.data['image/png'] ? null : multiline(output.data['text/plain'])
      if (text !== null) assert.ok(rendered.markdown.includes(codeFence(text)), 'saved output retained verbatim')
    }
  })
  assert.ok(rendered.markdown.includes('\n# 神经网络实践\n'))
  assert.ok(rendered.markdown.includes('UserWarning: The .grad attribute'))
  assert.ok(rendered.markdown.includes('展开完整输出（121 行）'))
})

test('all three rendered PNGs match saved outputs byte for byte, with meaningful descriptions', () => {
  const rendered = renderNotebook(savedNotebook)
  const originals = savedNotebook.cells.flatMap(cell => (cell.outputs || []).filter(output => output.data?.['image/png']).map(output => Buffer.from(multiline(output.data['image/png']), 'base64')))
  assert.equal(originals.length, 3)
  assert.deepEqual(rendered.images.map(image => hash(image.data)), originals.map(hash))
  assert.deepEqual(rendered.images.map(image => image.filename), ['cell-016-output-01.png', 'cell-019-output-01.png', 'cell-020-output-01.png'])
  for (const description of ['训练损失随训练轮数变化的曲线', '神经网络拟合结果与目标函数的对比', '神经网络预测相对于目标函数的相对误差']) assert.ok(rendered.markdown.includes(description))
  assert.ok(!rendered.markdown.includes('<Figure size 640x480 with 1 Axes>'), 'PNG chosen over its alternate plain-text representation')
})

test('conversion is deterministic and generated page/assets are current', async () => {
  const first = renderNotebook(savedNotebook)
  const second = renderNotebook(savedNotebook)
  assert.deepEqual(first, second)
  assert.equal(await readFile(path.join(repoRoot, pageFile), 'utf8'), first.markdown)
  for (const image of first.images) assert.deepEqual(await readFile(path.join(repoRoot, assetDirectory, image.filename)), image.data)
  await renderClassroomNotebook(repoRoot, { check: true })
})

test('multiline string and array inputs are equivalent; outputs from empty-source cells are retained', () => {
  const plain = notebook([codeCell('print(1)\n', [{ output_type: 'stream', name: 'stdout', text: '1\n' }])])
  const arrays = notebook([codeCell(['print(1)', '\n'], [{ output_type: 'stream', name: 'stdout', text: ['1', '\n'] }])])
  assert.deepEqual(renderNotebook(plain), renderNotebook(arrays))
  const onlyOutput = renderNotebook(notebook([codeCell('', [{ output_type: 'stream', name: 'stdout', text: 'saved output' }], null)]))
  assert.equal(onlyOutput.stats.codeCells, 1)
  assert.equal(onlyOutput.stats.skippedEmptyCells, 0)
  assert.ok(onlyOutput.markdown.includes('saved output'))
})

test('code and output cannot close their fence or become Vue template markup', () => {
  const tick = String.fromCharCode(96)
  const source = tick.repeat(5) + '\n{{ untrusted }}\n<script>alert(1)</script>\n' + tick.repeat(3)
  const fenced = codeFence(source, 'python')
  assert.ok(fenced.startsWith(tick.repeat(6) + 'python\n'))
  assert.ok(fenced.endsWith('\n' + tick.repeat(6)))
  assert.ok(fenced.includes(source))
  const rendered = renderNotebook(notebook([codeCell(source, [{ output_type: 'stream', name: 'stdout', text: source }])]))
  assert.ok(rendered.markdown.includes(codeFence(source, 'python')))
  assert.ok(rendered.markdown.includes(codeFence(source)))
})

test('unsupported cell, output, MIME types and malformed data fail loudly with cell location', () => {
  assert.throws(() => renderNotebook(notebook([{ cell_type: 'raw', source: 'raw' }])), /cell 1: unsupported cell type/)
  assert.throws(() => renderNotebook(notebook([codeCell('x', [{ output_type: 'error', traceback: ['error'] }])])), /cell 1, output 1: unsupported output type/)
  assert.throws(() => renderNotebook(notebook([codeCell('x', [{ output_type: 'display_data', data: { 'text/html': '<script>bad()</script>', 'text/plain': 'fallback' } }])])), /cell 1, output 1: unsupported MIME/)
  assert.throws(() => renderNotebook(notebook([codeCell('x', [{ output_type: 'display_data', data: { 'image/png': 'invalid!' } }])])), /invalid PNG base64/)
  assert.throws(() => renderNotebook(notebook([{ cell_type: 'markdown', source: 'image', attachments: { image: {} } }])), /markdown attachments/)
  assert.throws(() => renderNotebook(notebook([codeCell({ text: 'invalid' })])), /cell 1 source: expected/)
})

test('long outputs collapse only above 40 lines and retain full data', () => {
  for (const count of [40, 41]) {
    const text = Array.from({ length: count }, (_, index) => 'line ' + index).join('\n') + '\n'
    const rendered = renderNotebook(notebook([codeCell('', [{ output_type: 'stream', name: 'stdout', text }])]))
    assert.equal(rendered.markdown.includes('<details class="notebook-long-output">'), count > 40)
    assert.ok(rendered.markdown.includes(codeFence(text)))
  }
})

test('Markdown code-fence comments remain unchanged when H1 headings are demoted', () => {
  const fence = String.fromCharCode(96).repeat(3)
  const markdown = '# Heading\n\n' + fence + 'python\n# Python comment\n' + fence + '\n'
  const rendered = renderNotebook(notebook([{ cell_type: 'markdown', source: markdown }]))
  assert.ok(rendered.markdown.includes('## Heading'))
  assert.ok(rendered.markdown.includes(fence + 'python\n# Python comment\n' + fence))
})
