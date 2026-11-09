import { Notice, Panel } from "@/components/ui";
export default function Configure() {
  return <Panel title="Conecte o banco e a autenticação"><div className="pad stack"><Notice>O Supabase ainda precisa ser configurado. Seus registros serão guardados no banco da organização.</Notice><ol className="steps"><li>Inicie o Supabase local ou crie um projeto dedicado.</li><li>Aplique as migrations versionadas.</li><li>Preencha a URL e a chave publicável em <code>.env.local</code>.</li><li>Reinicie o aplicativo para abrir a tela de cadastro.</li></ol><p className="muted">Consulte o README para a configuração e os comandos.</p></div></Panel>;
}
