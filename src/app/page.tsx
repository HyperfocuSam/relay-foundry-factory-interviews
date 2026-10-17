import Link from "next/link";

const sections = [
  {
    name: "Dashboard",
    title: "Start with one process.",
    description: "Organize interviews around a clear objective. See which sessions need a conversation, a review, or a decision.",
    outcome: "A focused interview session",
  },
  {
    name: "Meeting room",
    title: "Make room for experience.",
    description: "Bring the people who know the work into a shared conversation. Capture the steps, judgment calls, and exceptions that matter.",
    outcome: "Conversation material to review",
  },
  {
    name: "Session review",
    title: "Check the story against the evidence.",
    description: "Review the transcript and workflow alongside available documents. Correct details, trace sources, and make uncertainty visible.",
    outcome: "A workflow with traceable sources",
  },
  {
    name: "Next steps",
    title: "Choose a small, useful next step.",
    description: "Resolve the important questions and prepare one pilot recommendation, including what is needed and when to stop.",
    outcome: "An evidence-backed pilot decision",
  },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Factory Interviews home">
          <span className="brand-mark" aria-hidden="true">fi</span>
          Factory Interviews
        </Link>
        <span className="project-label">AI Builder Cup · 2026</span>
      </header>
      <main id="main" className="workspace">
        <section className="intro" aria-labelledby="intro-heading">
          <span className="eyebrow">From conversation to a considered decision</span>
          <h1 id="intro-heading">Experience worth capturing.<br />A next step worth taking.</h1>
          <p className="intro-copy">Help a factory turn everyday know-how into a reviewed workflow and decide where a small AI pilot could help.</p>
          <Link className="primary-link" href="/workspace">Open your workspace <span aria-hidden="true">↗</span></Link>
        </section>
        <section id="product-flow" aria-labelledby="flow-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The workspace</span>
              <h2 id="flow-heading">One process. Four connected steps.</h2>
            </div>
            <span className="status">Open the team workspace</span>
          </div>
          <div className="section-grid">
            {sections.map((section, index) => (
              <article className="flow-card" key={section.name}>
                <div className="card-top">
                  <span className="step-number">0{index + 1}</span>
                  <h3>{section.name}</h3>
                </div>
                <h4>{section.title}</h4>
                <p>{section.description}</p>
                <div className="outcome"><span>Outcome</span>{section.outcome}</div>
              </article>
            ))}
          </div>
        </section>
        <aside className="scope-note" aria-label="Starter status">
          <strong>A workspace for your first process.</strong>
          <p>Create a session, join a live interview, capture speech or typed chat, review its sources, and export a decision snapshot. Sign in to save interviews in your team workspace. Review AI-assisted drafts against their source evidence.</p>
        </aside>
      </main>
      <footer className="site-footer">
        <span>Factory Interviews</span>
        <span>One interview. Clear evidence. A useful next step.</span>
      </footer>
    </>
  );
}
