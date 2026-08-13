"use client";

import * as React from "react";
import { Controller, FormProvider, useFormContext, UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";

type FormProps = React.HTMLAttributes<HTMLFormElement> & {
  form?: UseFormReturn<any>;
};

export function Form({ children, form, className, ...props }: FormProps) {
  if (form) {
    return (
      <FormProvider {...form}>
        <form className={cn(className)} {...props}>
          {children}
        </form>
      </FormProvider>
    );
  }

  return (
    <form className={cn(className)} {...props}>
      {children}
    </form>
  );
}

export function FormItem({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1", className)} {...props}>
      {children}
    </div>
  );
}

export function FormLabel({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-medium leading-6", className)} {...props}>
      {children}
    </label>
  );
}

export function FormControl({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center", className)} {...props}>
      {children}
    </div>
  );
}

export function FormMessage({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-destructive", className)} {...props}>
      {children}
    </p>
  );
}

type FormFieldProps = {
  control?: any;
  name: string;
  render: (props: any) => React.ReactNode;
};

export function FormField({ control, name, render }: FormFieldProps) {
  const ctx = useFormContext();

  return (
    <Controller
      control={control ?? ctx.control}
      name={name as any}
      render={({ field, fieldState }: { field: any; fieldState: any }) => (
        <FormItem>
          <FormControl>{render({ ...field })}</FormControl>
          {fieldState?.error?.message && <FormMessage>{String(fieldState.error.message)}</FormMessage>}
        </FormItem>
      )}
    />
  );
}

export type { UseFormReturn };
