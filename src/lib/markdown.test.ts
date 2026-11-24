import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBlocks, parseInline } from './markdown.ts'

test('a diary entry is cut into its blocks', () => {
  const blocks = parseBlocks(
    [
      '# Buen día',
      '## Wednesday, 24 May 2023 at 10:04 AM',
      'Lugar: Montevideo',
      '',
      '[foto 1]',
      '',
      'Me levanté temprano.',
      'Fui al gym.',
      '',
      '---',
      '### Work',
      '- uno',
      '  - dos',
      '1. tres',
      '> una cita',
      '```',
      '# no es un título',
      '```',
    ].join('\n'),
  )
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'heading', 'paragraph', 'media', 'paragraph', 'rule', 'heading', 'list', 'quote', 'code'],
  )
  assert.deepEqual(blocks[0], { type: 'heading', level: 1, text: 'Buen día' })
  assert.deepEqual(blocks[3], { type: 'media', kind: 'image', n: 1, raw: '[foto 1]' })
  // Line breaks inside a paragraph are kept as typed.
  assert.deepEqual(blocks[4], { type: 'paragraph', lines: ['Me levanté temprano.', 'Fui al gym.'] })
  const list = blocks[7]
  assert.ok(list?.type === 'list')
  assert.deepEqual(
    list.items.map((i) => [i.depth, i.ordered, i.text]),
    [
      [0, false, 'uno'],
      [1, false, 'dos'],
      [0, true, 'tres'],
    ],
  )
  assert.deepEqual(blocks[9], { type: 'code', text: '# no es un título' })
})

test('a template entry keeps its six-hash headings and its rules', () => {
  const blocks = parseBlocks('Created at 18:15\n\n###### Highlights del día\nAyer hablé con papá.\n\n---\n')
  assert.deepEqual(
    blocks.map((b) => (b.type === 'heading' ? `h${b.level}` : b.type)),
    ['paragraph', 'h6', 'paragraph', 'rule'],
  )
})

test('plain text with nothing to read as Markdown is one paragraph per block of lines', () => {
  assert.deepEqual(parseBlocks('hola\n\nchau'), [
    { type: 'paragraph', lines: ['hola'] },
    { type: 'paragraph', lines: ['chau'] },
  ])
  assert.deepEqual(parseBlocks(''), [])
})

test('emphasis, code, links and markers are found inside a line', () => {
  assert.deepEqual(parseInline('Fue **muy** bueno, *de verdad*, con `code` y [un link](https://example.com/a).'), [
    { type: 'text', text: 'Fue ' },
    { type: 'strong', children: [{ type: 'text', text: 'muy' }] },
    { type: 'text', text: ' bueno, ' },
    { type: 'em', children: [{ type: 'text', text: 'de verdad' }] },
    { type: 'text', text: ', con ' },
    { type: 'code', text: 'code' },
    { type: 'text', text: ' y ' },
    { type: 'link', href: 'https://example.com/a', children: [{ type: 'text', text: 'un link' }] },
    { type: 'text', text: '.' },
  ])
  assert.deepEqual(parseInline('antes [video 2] después'), [
    { type: 'text', text: 'antes ' },
    { type: 'media', kind: 'video', n: 2, raw: '[video 2]' },
    { type: 'text', text: ' después' },
  ])
})

test('what is not Markdown stays text', () => {
  // A lone asterisk, snake_case, a multiplication, an unsafe link.
  for (const plain of ['2 * 3 = 6', 'mi_variable_larga', 'a * b * c', '[click](javascript:alert(1))', '*¿Mi peso?* ']) {
    const out = parseInline(plain)
    if (plain.startsWith('*¿')) {
      assert.equal(out[0]?.type, 'em')
      continue
    }
    assert.deepEqual(out, [{ type: 'text', text: plain }], plain)
  }
})

test('a bare address becomes a link, without the full stop after it', () => {
  assert.deepEqual(parseInline('Ver https://example.com/x.'), [
    { type: 'text', text: 'Ver ' },
    { type: 'link', href: 'https://example.com/x', children: [{ type: 'text', text: 'https://example.com/x' }] },
    { type: 'text', text: '.' },
  ])
})

test('a mention token passes through untouched, underscores and all', () => {
  const token = '@[Ana_María](person:ana000000000000000000001)'
  assert.deepEqual(parseInline(`Con ${token} *hoy*`), [
    { type: 'text', text: `Con ${token} ` },
    { type: 'em', children: [{ type: 'text', text: 'hoy' }] },
  ])
})

test('a day reads in a list as a title and its first prose, without the markup', async () => {
  const { previewOf } = await import('./markdown.ts')
  assert.deepEqual(
    previewOf('# Comida en lo de Víctor\n## martes, 4 de marzo de 2025 (Apple Journal)\n\nAyer fuimos a un **bloco**.'),
    { title: 'Comida en lo de Víctor', body: 'Ayer fuimos a un bloco.' },
  )
  assert.deepEqual(previewOf('## miércoles, 6 de agosto de 2025 (Apple Journal)\n\nParte de mi conflicto.'), {
    title: null,
    body: 'Parte de mi conflicto.',
  })
  assert.deepEqual(previewOf('Created at 18:15\n\n###### Highlights del dia\n* Ayer hablé con papá'), {
    title: null,
    body: 'Ayer hablé con papá',
  })
  assert.deepEqual(previewOf('# Apps\n[audio 1] · Transcripción: algo · Grabado: hoy'), { title: 'Apps', body: '' })
  assert.deepEqual(previewOf('[foto 1]\n\nLugar: Rio\n\nUn día de [sol](https://x).'), {
    title: null,
    body: 'Un día de sol.',
  })
})
