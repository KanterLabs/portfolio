import { KANTERLABS_ORG_URL } from './kanterlabs';

export const capabilityGroups = [
  {
    name: 'Systems and Networking',
    description: 'Provision, connect, and troubleshoot Linux systems across physical and virtual infrastructure.',
    items: ['Linux', 'Proxmox', 'Nginx', 'Caddy', 'Cloudflare', 'Tailscale', 'PXE Boot'],
  },
  {
    name: 'Platform and Delivery',
    description: 'Build repeatable delivery paths with isolated CI, container workflows, health checks, and rollback.',
    items: ['GitHub Actions', 'k3s', 'ARC', 'Docker', 'GHCR', 'Coolify', 'Atomic Releases'],
  },
  {
    name: 'Software and Data',
    description: 'Write the application and automation code that makes infrastructure practical to operate.',
    items: ['Rust', 'TypeScript', 'Next.js', 'Python', 'PostgreSQL', 'Git', 'Astro'],
  },
];

export const profilePoints = [
  'Rack-and-stack and server deployment experience',
  'Linux administration and troubleshooting background',
  'Self-hosted systems for development, backups, and web app hosting',
];

export const certifications = [
  {
    name: 'Technical Support Fundamentals',
    issuer: 'Google / Coursera',
    date: 'June 2025',
    credentialId: '5BHVX4W2WMD5',
  },
];

export const [topCertification] = certifications;

export const timelineEntries = [
  {
    date: 'June 2025 – Present',
    org: 'InterServer — Secaucus, NJ',
    title: 'Data Center Technician',
    body:
      'Live data center work: server builds and hardware mods, rack-and-stack, OS installs (Linux, Windows, Proxmox), hardware diagnostics, decommissioning, an ongoing ~72-rack data center buildout, and PXE imaging.',
    href: '/projects/data-center-operations',
    linkLabel: 'Read experience notes',
  },
  {
    date: 'Sept. 2023 – May 2027',
    org: 'Southern Connecticut State University',
    title: 'Computer Science Student',
    body:
      'Building skills in software engineering, operating systems, and networking.',
    href: '',
    linkLabel: '',
  },
  {
    date: topCertification.date,
    org: `${topCertification.issuer} · Certification`,
    title: topCertification.name,
    body: `Credential ${topCertification.credentialId}`,
    href: '',
    linkLabel: '',
  },
];

export const personalGithubUrl = 'https://github.com/ShaneKanterman04';
export const linkedInUrl = 'https://www.linkedin.com/in/shane-kanterman-4511a2234';
export const emailUrl = 'mailto:shanekanterman04@gmail.com';

// Shared public contact links. A résumé download is deliberately not linked
// in the portfolio navigation (tests/home.spec.ts).
export const contactLinks = [
  { label: 'Email', href: emailUrl },
  { label: 'LinkedIn', href: linkedInUrl, external: true },
  { label: 'GitHub', href: KANTERLABS_ORG_URL, external: true },
  { label: 'Personal GitHub', href: personalGithubUrl, external: true },
];

export const structuredDataFor = (siteUrl: string) => [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Shane Kanterman',
    url: siteUrl,
    description:
      'Portfolio of Shane Kanterman, a Data Center Technician at InterServer, featuring production server operations, Linux systems, deployment tooling, and infrastructure projects.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Shane Kanterman',
    url: siteUrl,
    sameAs: [linkedInUrl, KANTERLABS_ORG_URL, personalGithubUrl],
    email: 'mailto:shanekanterman04@gmail.com',
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: 'Southern Connecticut State University',
    },
    knowsAbout: [
      'Linux administration',
      'Platform engineering',
      'Deployment automation',
      'Continuous integration',
      'Server deployment',
      'Data center operations',
      'Network infrastructure',
      'Proxmox',
      'Kubernetes',
      'Docker',
      'Rust',
      'Nginx',
    ],
    jobTitle: 'Data Center Technician',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KanterLabs',
    url: KANTERLABS_ORG_URL,
    logo: new URL('/apple-touch-icon.png', siteUrl).toString(),
    description:
      'Independent product and infrastructure studio building developer tools, self-hosted platforms, and practical software.',
    founder: { '@type': 'Person', name: 'Shane Kanterman', url: siteUrl },
    sameAs: [KANTERLABS_ORG_URL],
  },
];
