import { useLang } from "../context/LanguageContext";

// Loader padrão do app: só o anel girando na cor do tema.
// - padrão: centraliza na página;  inline: bloco no fluxo (abaixo do cabeçalho);
// - size="sm": anel pequeno dentro de textos e botões.
export default function Spinner({ inline = false, size }) {
  const { t } = useLang();
  if (size === "sm")
    return <span className="ring ring-sm" role="status" aria-label={t("common.loading")} />;
  return (
    <div
      className={"page-loader" + (inline ? " inline" : "")}
      role="status"
      aria-label={t("common.loading")}
    >
      <span className="ring" />
    </div>
  );
}
