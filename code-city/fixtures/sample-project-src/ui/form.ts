import { renderButton } from "./button.ts";
import { isNonEmpty } from "../utils/validate.ts";
import type { FormField } from "./types.ts";

export class Form {
  private fields: FormField[] = [];

  addField(field: FormField): this {
    this.fields.push(field);
    return this;
  }

  isValid(): boolean {
    return this.fields
      .filter((f) => f.required)
      .every((f) => isNonEmpty(f.value));
  }

  render(): string {
    const inputs = this.fields
      .map((f) => `<input name="${f.name}" value="${f.value}" />`)
      .join("\n");
    const submit = renderButton({ label: "submit", variant: "primary" });
    return `${inputs}\n${submit}`;
  }
}

export function newForm(): Form {
  return new Form();
}
