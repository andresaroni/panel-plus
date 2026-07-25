"use client";

import { useFormStatus } from "react-dom";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
};

export function SubmitButton({ children, pendingLabel = "Guardando...", ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <button {...props} disabled={pending || props.disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}
