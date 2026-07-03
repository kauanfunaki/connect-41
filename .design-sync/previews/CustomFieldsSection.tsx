import { CustomFieldsSection } from 'connect-41';

export function Default() {
  return (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <CustomFieldsSection
        fields={[
          { id: 'f1', label: 'Regime tributário', fieldType: 'SELECT', options: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'], required: true, value: 'Simples Nacional' },
          { id: 'f2', label: 'Observações', fieldType: 'TEXTAREA', options: [], required: false, value: 'Cliente desde 2021, contrato renovado anualmente.' },
          { id: 'f3', label: 'Número de funcionários', fieldType: 'NUMBER', options: [], required: false, value: '12' },
          { id: 'f4', label: 'Contrato ativo', fieldType: 'BOOLEAN', options: [], required: false, value: 'true' },
        ]}
      />
    </div>
  );
}
