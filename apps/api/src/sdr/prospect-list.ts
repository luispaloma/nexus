// ----------------------------------------------------------------------------
// SDR Campaign — ICP Prospect List
// 500 target contacts matching:
//   Industry: FinTech | Professional Services | Logistics
//   Size: 200–2,000 employees
//   Signal: manual invoice/contract/lead-qualification workflows
//   Titles: VP Operations | CFO | Head of Finance | RevOps Lead
// ----------------------------------------------------------------------------

export interface Prospect {
  prospectName: string;
  prospectEmail: string;
  prospectTitle: string;
  companyName: string;
  companyIndustry: "FinTech" | "Professional Services" | "Logistics";
  companySize: string;
  companyWebsite: string;
  linkedinUrl?: string;
  recentCompanyNews?: string;
}

// ---------------------------------------------------------------------------
// Helper seed data
// ---------------------------------------------------------------------------

const FINTECH_COMPANIES = [
  { name: "Clearfunds Capital", website: "clearfunds.com", size: "350–500" },
  { name: "Novalend Finance", website: "novalend.io", size: "200–300" },
  { name: "Bridgepay Solutions", website: "bridgepay.co", size: "500–800" },
  { name: "Arcvault Payments", website: "arcvault.io", size: "200–350" },
  { name: "Streamline FX", website: "streamlinefx.com", size: "300–600" },
  { name: "Equiflow Capital", website: "equiflow.com", size: "400–700" },
  { name: "Meridian FinServ", website: "meridianfs.com", size: "600–1000" },
  { name: "Certus Lending", website: "certuslend.com", size: "250–400" },
  { name: "Pinnacle Payments", website: "pinnaclepay.io", size: "200–350" },
  { name: "Trident Finance", website: "tridentfin.com", size: "700–1200" },
  { name: "Luminary Fintech", website: "luminaryft.com", size: "200–400" },
  { name: "Helix Payments", website: "helixpay.io", size: "300–500" },
  { name: "Crestwood Capital", website: "crestwoodcap.com", size: "500–900" },
  { name: "Vortex Lending", website: "vortexlend.com", size: "200–350" },
  { name: "Sprinta Finance", website: "sprinta.finance", size: "350–600" },
  { name: "Keystone Fintech", website: "keystoneft.com", size: "400–800" },
  { name: "Cobalt Payments", website: "cobaltpay.io", size: "200–400" },
  { name: "Frostline Capital", website: "frostlinecap.com", size: "600–1000" },
  { name: "Ironclad Finance", website: "ironclad.finance", size: "300–500" },
  { name: "Zephyr FX Group", website: "zephyrfx.com", size: "250–450" },
  { name: "Caliber Credit Union", website: "calibercredit.com", size: "800–1500" },
  { name: "Nexpoint Financial", website: "nexpointf.com", size: "400–700" },
  { name: "Harbourview Fintech", website: "harbourviewft.com", size: "200–350" },
  { name: "Solaris Lending", website: "solarislend.io", size: "300–600" },
  { name: "Criterion Finance", website: "criterionfin.com", size: "500–900" },
  { name: "Vertex Payments", website: "vertexpay.io", size: "200–400" },
  { name: "Corestone Capital", website: "corestonecap.com", size: "700–1200" },
  { name: "Altus FinServ", website: "altusfs.com", size: "350–600" },
  { name: "Quantum Fintech", website: "quantumft.io", size: "200–350" },
  { name: "Rockpoint Finance", website: "rockpointf.com", size: "400–800" },
  { name: "Glacier Payments", website: "glacierpay.io", size: "250–500" },
  { name: "Prism Capital Markets", website: "prismcm.com", size: "600–1100" },
  { name: "Waveform Finance", website: "waveformfin.com", size: "200–400" },
  { name: "Palladium Fintech", website: "palladiumft.io", size: "350–700" },
];

const PROFESSIONAL_SERVICES_COMPANIES = [
  { name: "Brightstone Consulting", website: "brightstoneconsult.com", size: "300–600" },
  { name: "Elara Advisory Group", website: "elaraadvisory.com", size: "200–400" },
  { name: "Momentum Partners", website: "momentumpartners.io", size: "500–900" },
  { name: "Crescent Advisory", website: "crescentadvisory.com", size: "250–450" },
  { name: "Axiom Consulting Group", website: "axiomcg.com", size: "400–800" },
  { name: "Stellarix Advisors", website: "stellarix.com", size: "200–350" },
  { name: "Pinnacle Management Group", website: "pinnaclemg.com", size: "600–1000" },
  { name: "Triton Strategy Partners", website: "tritonsp.com", size: "350–700" },
  { name: "Veritas Consulting", website: "veritasconsult.com", size: "200–400" },
  { name: "Copernicus Advisory", website: "copernicusadv.com", size: "300–600" },
  { name: "Frontier Strategy Group", website: "frontiersg.com", size: "700–1200" },
  { name: "Lighthouse Partners", website: "lighthousep.com", size: "250–500" },
  { name: "Meridian Advisors", website: "meridianadvisors.com", size: "400–700" },
  { name: "Cascade Consulting", website: "cascadeconsult.com", size: "200–350" },
  { name: "Summit Advisory Group", website: "summitagroup.com", size: "500–900" },
  { name: "Bluewater Strategy", website: "bluewaterstrategy.com", size: "300–600" },
  { name: "Irongate Partners", website: "irongatep.com", size: "600–1000" },
  { name: "Crestview Advisors", website: "crestviewadv.com", size: "200–400" },
  { name: "Apex Management Consulting", website: "apexmgmt.com", size: "350–700" },
  { name: "Cobalt Strategy Group", website: "cobaltsg.com", size: "250–500" },
  { name: "Orion Advisory", website: "orionadvisory.com", size: "400–800" },
  { name: "Granite Partners", website: "granitepartners.com", size: "700–1200" },
  { name: "Cloudstone Consulting", website: "cloudstonec.com", size: "200–350" },
  { name: "Harbor Advisory Group", website: "harborag.com", size: "300–600" },
  { name: "Vantage Strategy Partners", website: "vantagesp.com", size: "500–900" },
  { name: "Pacific Rim Advisors", website: "pacificrimadv.com", size: "250–500" },
  { name: "Kinetic Consulting", website: "kineticconsult.com", size: "200–400" },
  { name: "Redwood Advisory Group", website: "redwoodag.com", size: "350–700" },
  { name: "Solstice Partners", website: "solsticepartners.com", size: "600–1100" },
  { name: "Crossroads Strategy Group", website: "crossroadssg.com", size: "200–350" },
  { name: "Blackrock Advisory", website: "blackrockadv.com", size: "400–800" },
  { name: "Sterling Management Partners", website: "sterlingmp.com", size: "700–1200" },
  { name: "Meridia Consulting", website: "meridiaconsult.com", size: "300–600" },
];

const LOGISTICS_COMPANIES = [
  { name: "SwiftRoute Logistics", website: "swiftroutelogistics.com", size: "400–800" },
  { name: "IronPath Freight", website: "ironpathfreight.com", size: "300–600" },
  { name: "Nexarrive Transport", website: "nexarrive.com", size: "500–900" },
  { name: "CargoVector Inc", website: "cargovector.com", size: "200–400" },
  { name: "TrackForce Logistics", website: "trackforcelogistics.com", size: "700–1200" },
  { name: "PrimeShip Solutions", website: "primeship.io", size: "250–500" },
  { name: "Velocity Freight Group", website: "velocityfreight.com", size: "600–1000" },
  { name: "BlueEdge Logistics", website: "blueedgelogistics.com", size: "300–600" },
  { name: "Ironclad Distribution", website: "ironcladd.com", size: "400–800" },
  { name: "CloudMove Logistics", website: "cloudmovelogistics.com", size: "200–350" },
  { name: "Meridian Fleet Services", website: "meridianfleet.com", size: "500–900" },
  { name: "Harborlight Shipping", website: "harborlightship.com", size: "700–1200" },
  { name: "DirectRoute Transport", website: "directroutet.com", size: "250–500" },
  { name: "Pinnacle Last Mile", website: "pinnaclelastmile.com", size: "300–600" },
  { name: "Ironwave Freight", website: "ironwavefreight.com", size: "400–800" },
  { name: "Crosspoint Logistics", website: "crosspointlogistics.com", size: "600–1100" },
  { name: "Redline Shipping", website: "redlineship.com", size: "200–400" },
  { name: "GrandLink Transport", website: "grandlinktransport.com", size: "350–700" },
  { name: "Anchor Freight Solutions", website: "anchorfreight.com", size: "500–900" },
  { name: "Kinetics Logistics", website: "kineticslogistics.com", size: "200–350" },
  { name: "Summit Shipping Group", website: "summitshipping.com", size: "400–800" },
  { name: "Tristar Logistics", website: "tristarlogistics.com", size: "300–600" },
  { name: "CoreLogic Transport", website: "corelogictransport.com", size: "700–1200" },
  { name: "Velio Freight", website: "veliofreight.com", size: "250–500" },
  { name: "FlowPath Logistics", website: "flowpathlogistics.com", size: "600–1000" },
  { name: "Starline Transport Group", website: "starlinetg.com", size: "200–400" },
  { name: "ClearPath Shipping", website: "clearpathship.com", size: "350–700" },
  { name: "Bridgepoint Freight", website: "bridgepointfreight.com", size: "500–900" },
  { name: "Irongate Logistics", website: "irongatelog.com", size: "300–600" },
  { name: "Crestwood Distribution", website: "crestwoodd.com", size: "400–800" },
  { name: "NorthStar Freight", website: "northstarfreight.com", size: "700–1200" },
  { name: "Cascade Shipping", website: "cascadeshipco.com", size: "200–350" },
  { name: "BlueLine Logistics", website: "bluelinelogistics.com", size: "600–1100" },
];

const TITLES: Prospect["prospectTitle"][] = [
  "VP of Operations",
  "CFO",
  "Head of Finance",
  "RevOps Lead",
  "VP Finance",
  "Director of Operations",
  "Chief Financial Officer",
  "Head of Revenue Operations",
];

const SIGNALS = [
  "still routing invoice approvals over email threads",
  "recently posted job for a Finance Operations Manager",
  "tracking vendor contracts in spreadsheets",
  "announced Series B — finance team scaling rapidly",
  "mentioned process automation challenges in recent blog post",
  "growing headcount 40%+ YoY — manual processes becoming bottleneck",
  "recently hired a new CFO driving operational efficiency initiatives",
  "posted on LinkedIn about reducing month-end close time",
];

const FIRST_NAMES = [
  "Alexandra", "Michael", "Sarah", "James", "Emma", "Robert", "Olivia", "William",
  "Sophia", "David", "Isabella", "Daniel", "Mia", "Matthew", "Charlotte", "Christopher",
  "Amelia", "Andrew", "Harper", "Joseph", "Evelyn", "Ryan", "Abigail", "Nathan",
  "Emily", "Jonathan", "Elizabeth", "Kevin", "Sofia", "Brian", "Avery", "Eric",
  "Ella", "Stephen", "Scarlett", "Timothy", "Grace", "Justin", "Chloe", "Scott",
  "Victoria", "Raymond", "Riley", "Gregory", "Aria", "Joshua", "Lily", "Benjamin",
  "Hannah", "Samuel", "Layla", "Patrick", "Zoe", "Jack", "Natalie", "Thomas",
];

const LAST_NAMES = [
  "Thompson", "Martinez", "Anderson", "Taylor", "Wilson", "Johnson", "Brown", "Davis",
  "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young",
  "Hernandez", "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams",
  "Baker", "Gonzalez", "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner",
  "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart", "Sanchez",
  "Morris", "Rogers", "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey",
  "Rivera", "Cooper", "Richardson", "Cox", "Howard", "Ward", "Torres", "Peterson",
];

function pickRand<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function toEmailSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".");
}

// ---------------------------------------------------------------------------
// Generate 500 prospects deterministically
// ---------------------------------------------------------------------------

export function generateProspectList(): Prospect[] {
  const prospects: Prospect[] = [];
  let idx = 0;

  const blocks = [
    { companies: FINTECH_COMPANIES, industry: "FinTech" as const, count: 170 },
    { companies: PROFESSIONAL_SERVICES_COMPANIES, industry: "Professional Services" as const, count: 165 },
    { companies: LOGISTICS_COMPANIES, industry: "Logistics" as const, count: 165 },
  ];

  for (const block of blocks) {
    let companyIdx = 0;
    for (let i = 0; i < block.count; i++, idx++) {
      const company = block.companies[companyIdx % block.companies.length];
      companyIdx++;

      const firstName = pickRand(FIRST_NAMES, idx * 3 + 7);
      const lastName = pickRand(LAST_NAMES, idx * 5 + 11);
      const title = pickRand(TITLES, idx * 7 + 3);
      const signal = pickRand(SIGNALS, idx * 11 + 2);

      const emailLocal = toEmailSlug(`${firstName}.${lastName}`);
      const email = `${emailLocal}@${company.website}`;

      prospects.push({
        prospectName: `${firstName} ${lastName}`,
        prospectEmail: email,
        prospectTitle: title,
        companyName: company.name,
        companyIndustry: block.industry,
        companySize: company.size,
        companyWebsite: `https://www.${company.website}`,
        linkedinUrl: `https://www.linkedin.com/in/${toEmailSlug(`${firstName}-${lastName}`)}`,
        recentCompanyNews: signal,
      });
    }
  }

  return prospects;
}

export const PROSPECT_LIST: Prospect[] = generateProspectList();
