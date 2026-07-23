import { Command } from "commander"
import { skillAddCommand } from "./add"
import { skillRemoveCommand } from "./remove"
import { skillListCommand } from "./list"

export const skillCommand = new Command("skill")
  .description("Manage agent skills")
  .addCommand(skillAddCommand)
  .addCommand(skillRemoveCommand)
  .addCommand(skillListCommand)
