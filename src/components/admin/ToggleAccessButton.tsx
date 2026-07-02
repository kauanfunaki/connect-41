"use client";

type Props = {
  action: () => Promise<void>;
  hasAccess: boolean;
};

export function ToggleAccessButton({ action, hasAccess }: Props) {
  return (
    <button
      type="button"
      onClick={() => action()}
      className={
        hasAccess
          ? "h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors flex-shrink-0"
          : "h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors flex-shrink-0"
      }
    >
      {hasAccess ? "Revogar acesso" : "Conceder acesso"}
    </button>
  );
}
