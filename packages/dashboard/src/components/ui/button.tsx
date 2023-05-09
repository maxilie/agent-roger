import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "~/utils/tailwind-utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-slate-400 disabled:pointer-events-none dark:focus:ring-offset-slate-900 data-[state=open]:bg-slate-100 dark:data-[state=open]:bg-slate-800",
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 dark:hover:bg-red-600",
        outline:
          "bg-transparent border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100",
        tealTag:
          "bg-teal-800 hover:bg-teal-50 rounded-3xl shadow-md shadow-zinc-500 border border-teal-50 text-white hover:text-zinc-600",
        blueTag:
          "bg-sky-800 hover:bg-sky-50 rounded-3xl shadow-md shadow-zinc-500 border border-sky-50 text-white hover:text-zinc-600",

        grayTag:
          "bg-zinc-400 hover:bg-zinc-50 rounded-3xl shadow-md shadow-zinc-500 border border-zinc-50 text-white hover:text-zinc-600",
        greenTag:
          "bg-green-800 hover:bg-green-50 rounded-3xl shadow-md shadow-zinc-500 border border-green-50 text-white hover:text-zinc-600",
        blue: "bg-sky-950 border-2 hover:bg-slate-800 hover:border-opacity-85 border-sky-400 text-gray-100",
        blue2: "bg-blue-500 text-slate-50 hover:bg-blue-600",
        green:
          "bg-green-950 border-2 hover:bg-slate-800 hover:border-opacity-85 border-green-400 text-gray-100",
        yellow:
          "bg-yellow-500 text-slate-50 hover:bg-yellow-600 hover:text-slate-50",
        red: "bg-red-950 border-2 hover:bg-slate-800 hover:border-opacity-85 border-red-400 text-gray-100",
        subtle:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-400 dark:hover:bg-slate-500 dark:text-slate-100",
        ghost:
          "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-100 dark:hover:text-slate-100 data-[state=open]:bg-transparent dark:data-[state=open]:bg-transparent",
        link: "bg-transparent dark:bg-transparent underline-offset-4 hover:underline text-slate-900 dark:text-slate-100 hover:bg-transparent dark:hover:bg-transparent",
      },
      size: {
        flexibleTag: "flex items-center justify-center p-2",
        default: "h-10 py-2 px-4",
        sm: "h-9 px-2 rounded-md",
        lg: "h-11 px-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
