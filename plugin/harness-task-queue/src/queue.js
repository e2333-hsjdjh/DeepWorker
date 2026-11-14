import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const statuses = ['pending', 'in_progress', 'blocked', 'completed']

function requiredText(value, name, maxLength) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length === 0 || text.length > maxLength) {
    throw new RangeError(`${name} must have 1–${maxLength} characters`)
  }
  return text
}

function validateStatus(status) {
  if (!statuses.includes(status)) throw new RangeError('Unknown task status')
  return status
}

export function openQueue(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path, { timeout: 5000 })
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        instructions TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `)
    const get = db.prepare(`
      SELECT id, title, instructions, acceptance, status, note, updated_at
      FROM tasks WHERE id = ?
    `)
    const create = db.prepare(`
      INSERT INTO tasks (id, title, instructions, acceptance, status, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `)
    const update = db.prepare(`
      UPDATE tasks SET status = ?, note = ?, updated_at = ?
      WHERE id = ? RETURNING id, title, status, note, updated_at
    `)
    const listAll = db.prepare('SELECT id, title, status FROM tasks ORDER BY seq DESC LIMIT ? OFFSET ?')
    const listStatus = db.prepare('SELECT id, title, status FROM tasks WHERE status = ? ORDER BY seq DESC LIMIT ? OFFSET ?')
    return {
      create({ title, instructions, acceptance }) {
        const id = randomUUID()
        create.run(
          id,
          requiredText(title, 'title', 120),
          requiredText(instructions, 'instructions', 6000),
          requiredText(acceptance, 'acceptance', 3000),
          new Date().toISOString(),
        )
        return get.get(id)
      },
      get(id) {
        return get.get(id) ?? null
      },
      list({ status, limit = 10, offset = 0 } = {}) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50
          || !Number.isSafeInteger(offset) || offset < 0) {
          throw new RangeError('limit must be 1–50 and offset must be a nonnegative safe integer')
        }
        return status === undefined ? listAll.all(limit, offset) : listStatus.all(validateStatus(status), limit, offset)
      },
      update({ id, status, note = '' }) {
        validateStatus(status)
        const cleanNote = note.trim()
        if (cleanNote.length > 1500) throw new RangeError('note may have at most 1500 characters')
        if (['completed', 'blocked'].includes(status)) requiredText(cleanNote, 'note', 1500)
        return update.get(status, cleanNote, new Date().toISOString(), id) ?? null
      },
      close() {
        db.close()
      },
    }
  } catch (error) {
    db.close()
    throw error
  }
}
