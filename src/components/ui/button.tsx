import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-indigo-500 text-white hover:bg-indigo-400 disabled:hover:bg-indigo-500",
  secondary:
    "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:hover:bg-zinc-800",
  ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
  danger: "bg-rose-600/90 text-white hover:bg-rose-500",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
