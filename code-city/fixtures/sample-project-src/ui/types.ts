export interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface FormField {
  name: string;
  value: string;
  required: boolean;
}
