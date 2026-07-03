import { BulkActionBar } from 'connect-41';

export function Default() {
  return (
    <div style={{ position: 'relative', height: 160 }}>
      <BulkActionBar count={3} onClear={() => {}}>
        <button
          type="button"
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
        >
          Alterar status
        </button>
        <button
          type="button"
          className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
        >
          Excluir
        </button>
      </BulkActionBar>
    </div>
  );
}
