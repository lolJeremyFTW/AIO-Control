export const OUTREACH_PIPELINE_STAGES = [
  {
    key: "lead_finder",
    agent: "Lead Finder",
    label: "Vind lead",
  },
  {
    key: "firecrawl_scout",
    agent: "Firecrawl Scout",
    label: "Scrape",
  },
  {
    key: "score_agent",
    agent: "Score Agent",
    label: "Score",
  },
  {
    key: "angle_writer",
    agent: "Angle Writer",
    label: "Angle",
  },
  {
    key: "freebie_builder",
    agent: "Freebie Builder",
    label: "Rapport",
  },
  {
    key: "proposal_agent",
    agent: "Proposal Agent",
    label: "Automation",
  },
  {
    key: "qa_gate",
    agent: "QA Gate",
    label: "QA",
  },
  {
    key: "outreach_sender",
    agent: "Outreach Sender",
    label: "Outreach",
  },
] as const;
