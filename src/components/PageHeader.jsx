// cabeçalho padrão das páginas: título + subtítulo à esquerda, ações na mesma linha à direita
export default function PageHeader({ title, sub, children }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1 className="panel-title">{title}</h1>
        {sub && <p className="panel-sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}
