"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens or closes every <details data-collapsible-group> on the page. */
export function ExpandCollapseAll() {
  const setAll = (open: boolean) => {
    document
      .querySelectorAll<HTMLDetailsElement>("details[data-collapsible-group]")
      .forEach((el) => {
        el.open = open;
      });
  };

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
        <ChevronsUpDown className="h-3.5 w-3.5" />
        Expand all
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)}>
        <ChevronsDownUp className="h-3.5 w-3.5" />
        Collapse all
      </Button>
    </div>
  );
}
