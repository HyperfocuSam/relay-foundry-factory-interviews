"use client";

import { useId, type ReactNode } from "react";

export function Field({
  label,
  name,
  value = "",
  multiline = false,
  required = true,
  hint,
  maxLength = 2000,
}: {
  label: string;
  name: string;
  value?: string;
  multiline?: boolean;
  required?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  const id = useId();
  const props = {
    id,
    name,
    defaultValue: value,
    required,
    maxLength,
    "aria-describedby": hint ? `${id}-hint` : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {!required && <span> · optional</span>}
      </label>
      {multiline ? <textarea {...props} rows={4} /> : <input {...props} />}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function formText(
  data: FormData,
  name: string,
  required = true,
): string {
  const value = String(data.get(name) ?? "").trim();
  if (required && !value)
    throw new Error(
      "Please fill in all required fields; spaces alone are not enough.",
    );
  return value;
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
