import fs from "fs/promises"
import path from "path"
import os from "os"
import type { SkillDefinition, SkillsLock } from "./types"

const SUPERCODE_DIR = path.join(os.homedir(), ".supercode")
const LOCK_FILE = path.join(SUPERCODE_DIR, "skills-lock.json")

export function getSkillsDir(): string {
  return path.join(SUPERCODE_DIR, "skills")
}

export function getSkillDir(name: string): string {
  return path.join(getSkillsDir(), name)
}

export function getSkillFilePath(name: string): string {
  return path.join(getSkillDir(name), "SKILL.md")
}

export function getLockFilePath(): string {
  return LOCK_FILE
}

export async function readSkillsLock(): Promise<SkillsLock> {
  try {
    const data = await fs.readFile(LOCK_FILE, "utf-8")
    return JSON.parse(data) as SkillsLock
  } catch {
    return { version: 1, skills: {} }
  }
}

export async function writeSkillsLock(lock: SkillsLock): Promise<void> {
  await fs.mkdir(SUPERCODE_DIR, { recursive: true })
  await fs.writeFile(LOCK_FILE, JSON.stringify(lock, null, 2), "utf-8")
}

export async function addSkillToLock(
  name: string,
  definition: SkillDefinition,
): Promise<SkillsLock> {
  const lock = await readSkillsLock()
  lock.skills[name] = definition
  await writeSkillsLock(lock)
  return lock
}

export async function removeSkillFromLock(name: string): Promise<SkillsLock> {
  const lock = await readSkillsLock()
  delete lock.skills[name]
  await writeSkillsLock(lock)
  return lock
}

export async function listSkillEntries(): Promise<[string, SkillDefinition][]> {
  const lock = await readSkillsLock()
  return Object.entries(lock.skills)
}
