import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium tracking-tight ring-offset-background transition-[background-color,border-color,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // No shadow-soft here - the website's own buttons carry no shadow by
        // default (only its opt-in .btn-raised modifier does); a flat fill
        // reads more architectural than even a faint one.
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive",
        outline:
          "border border-input bg-background hover:bg-accent/20 hover:border-foreground/30 hover:text-accent-foreground active:bg-accent/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/80",
        ghost:
          "hover:bg-accent/20 hover:text-accent-foreground active:bg-accent/30",
        tertiary:
          "text-foreground/75 hover:text-foreground hover:bg-muted/50 active:bg-muted/70",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Thinner across the board (was h-9/h-8/h-10/h-9) - Input/Textarea/
      // Select got the matching h-8 default so controls still line up
      // in toolbars and forms. icon stays at a 32px floor, not smaller,
      // to keep touch targets adequate.
      size: {
        default: "h-8 px-3.5 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-[12px]",
        lg: "h-9 rounded-md px-5",
        icon: "h-8 w-8",
      },
    },
    // Matches the website's real `.btn` treatment (uppercase, letter-spaced,
    // regular weight) on actual CTA-shaped buttons only - default/lg sizes
    // of the filled/bordered variants, the ones that stand in for the
    // site's .btn-dark/.btn-light/.btn-outline. Left off `sm`/`icon` sizes
    // and off ghost/tertiary/link (the site's plain-case text-link
    // equivalent) so dense toolbars and inline row actions don't read as
    // shouting - see LINEAGE_BRAND_DESIGN_SYSTEM.md §4, §9.
    compoundVariants: [
      { variant: "default", size: "default", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "default", size: "lg", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "destructive", size: "default", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "destructive", size: "lg", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "outline", size: "default", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "outline", size: "lg", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "secondary", size: "default", class: "uppercase tracking-[0.02em] font-normal" },
      { variant: "secondary", size: "lg", class: "uppercase tracking-[0.02em] font-normal" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
