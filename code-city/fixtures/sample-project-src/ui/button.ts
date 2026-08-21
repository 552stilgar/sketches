import { titleCase } from "../utils/format.ts";
import type { ButtonProps } from "./types.ts";

export function renderButton(props: ButtonProps): string {
  const variant = props.variant ?? "primary";
  const disabledAttr = props.disabled ? " disabled" : "";
  const label = titleCase(props.label);
  return `<button class="btn btn-${variant}"${disabledAttr}>${label}</button>`;
}

export class ButtonGroup {
  private buttons: ButtonProps[] = [];

  add(props: ButtonProps): this {
    this.buttons.push(props);
    return this;
  }

  renderAll(): string {
    return this.buttons.map(renderButton).join("\n");
  }
}
