import { UsuariosTable } from 'connect-41';

const users = [
  { id: 'u1', name: 'Ana Souza', email: 'ana@41tech.com.br', roleLabel: 'Administradora', active: true, sectors: [{ code: 'contabil', label: 'Contábil', color: '#4F46E5' }] },
  { id: 'u2', name: 'Bruno Lima', email: 'bruno@41tech.com.br', roleLabel: 'Usuário de setor', active: true, sectors: [{ code: 'fiscal', label: 'Fiscal', color: '#C5374B' }, { code: 'dprh', label: 'DP/RH', color: '#7C5CBF' }] },
  { id: 'u3', name: 'Carla Dias', email: 'carla@41tech.com.br', roleLabel: 'Somente leitura', active: false, sectors: [] },
];

const sectorOptions = [
  { value: 'contabil', label: 'Contábil' },
  { value: 'fiscal', label: 'Fiscal' },
];

async function alternarAtivoUsuario() {}
async function alternarAtivoEmMassa() {}
async function atribuirSetorEmMassa() {}

export function Default() {
  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <UsuariosTable
        users={users}
        currentUserId="u1"
        sectorOptions={sectorOptions}
        alternarAtivoUsuario={alternarAtivoUsuario}
        alternarAtivoEmMassa={alternarAtivoEmMassa}
        atribuirSetorEmMassa={atribuirSetorEmMassa}
      />
    </div>
  );
}
