import fs from 'fs';
import path from 'path';

type RiskType = 'INNER_JOIN' | 'NULL_FILTER' | 'REQUIRED_RENDER' | 'POSSIBLE_HIDE';
type RiskLevel = 'BAIXO' | 'MÉDIO' | 'ALTO';

type RiskFinding = {
  file: string;
  line: number;
  type: RiskType;
  risk: RiskLevel;
  impact: string;
  suggestion: string;
  excerpt: string;
};

type NullKitCompatibilityReport = {
  generated_at: string;
  scope: {
    roots_scanned: string[];
    files_scanned: number;
  };
  totals: Record<RiskLevel, number>;
  findings: RiskFinding[];
  safe_areas: string[];
  areas_needing_adjustment: string[];
  recommendation: string[];
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
    alters: false;
    restore_executed: false;
  };
};

type PatternRule = {
  type: RiskType;
  regex: RegExp;
  risk: RiskLevel;
  impact: string;
  suggestion: string;
};

const ROOT_MARKERS = ['package.json', 'backend', 'src'];
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  'logs',
  'migrations',
  'scripts',
]);

const TARGET_EXTENSIONS = new Set(['.ts', '.tsx']);

const HIGH_VALUE_AREAS = [
  'organizerService.ts',
  'eventsService.ts',
  'registrationsService.ts',
  'reports',
  'export',
  'checkin',
  'dashboard',
  'EventDetailedReport.tsx',
  'OrganizerRegistrations.tsx',
  'AdminRegistrations.tsx',
  'EventManagement.tsx',
  'EventRegistrationsPanel.tsx',
  'EventRegistrationDetailSheet.tsx',
];

const PATTERN_RULES: PatternRule[] = [
  {
    type: 'INNER_JOIN',
    regex: /\bINNER\s+JOIN\s+(?:public\.)?(?:event_kits|kits)\b|\bJOIN\s+(?:public\.)?(?:event_kits|kits)\b/i,
    risk: 'ALTO',
    impact: 'inscrição some quando kit_id for NULL ou apontar para kit removido',
    suggestion: 'substituir por LEFT JOIN e exibir fallback "Kit removido" ou "Sem kit"',
  },
  {
    type: 'NULL_FILTER',
    regex: /\b(?:r\.|registrations\.)?kit_id\s+IS\s+NOT\s+NULL\b/i,
    risk: 'ALTO',
    impact: 'inscrições restauradas com kit_id NULL podem ser ignoradas',
    suggestion: 'remover filtro quando a regra de negócio permitir, ou isolar apenas auditorias específicas',
  },
  {
    type: 'POSSIBLE_HIDE',
    regex: /\bkit_id\s*(?:!==|!=)\s*null|\bkit_id\s*&&|\bif\s*\([^)]*kit_id[^)]*\)/i,
    risk: 'MÉDIO',
    impact: 'UI/relatório pode esconder blocos ou ações quando kit_id for NULL',
    suggestion: 'validar se a condição é apenas visual; se for listagem, tolerar null e mostrar fallback',
  },
  {
    type: 'REQUIRED_RENDER',
    regex: /\.\s*kit\s*\.\s*(?:name|id|price)|\bevent_kits\.(?:name|id|price)\b/i,
    risk: 'ALTO',
    impact: 'renderização pode quebrar quando objeto kit/event_kits não existir',
    suggestion: 'usar optional chaining e fallback textual',
  },
  {
    type: 'REQUIRED_RENDER',
    regex: /\bkit_name\b(?!\s*(?:\|\||\?\?))/i,
    risk: 'BAIXO',
    impact: 'nome do kit pode ficar ausente na exibição/export',
    suggestion: 'garantir fallback "Sem kit" ou "Kit removido"',
  },
];

const findRepoRoot = (): string => {
  let current = process.cwd();

  for (let depth = 0; depth < 6; depth++) {
    const hasMarkers = ROOT_MARKERS.every((marker) => fs.existsSync(path.join(current, marker)));
    if (hasMarkers) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return process.cwd();
};

const shouldIgnoreDir = (dirName: string): boolean => {
  return IGNORE_DIRS.has(dirName);
};

const walkFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) return [];
  const output: string[] = [];

  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) visit(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      const fullPath = path.join(dir, entry.name);
      if (TARGET_EXTENSIONS.has(path.extname(fullPath))) {
        output.push(fullPath);
      }
    }
  };

  visit(root);
  return output;
};

const normalizePath = (repoRoot: string, filePath: string): string => {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
};

const isHighValueArea = (relativePath: string): boolean => {
  return HIGH_VALUE_AREAS.some((area) => relativePath.includes(area));
};

const adjustRiskForContext = (baseRisk: RiskLevel, relativePath: string, excerpt: string): RiskLevel => {
  if (relativePath.includes('registrationKitSelectionAuditService')) return 'BAIXO';
  if (relativePath.includes('registrationEditableKitContextService')) return baseRisk === 'ALTO' ? 'MÉDIO' : baseRisk;
  if (baseRisk === 'ALTO' && !isHighValueArea(relativePath)) return 'MÉDIO';
  if (/LEFT\s+JOIN/i.test(excerpt)) return 'BAIXO';
  return baseRisk;
};

const analyzeFile = (repoRoot: string, filePath: string): RiskFinding[] => {
  const relativePath = normalizePath(repoRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const findings: RiskFinding[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    for (const rule of PATTERN_RULES) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(trimmed)) continue;

      if (rule.type === 'REQUIRED_RENDER' && /\?\./.test(trimmed)) continue;
      if (rule.type === 'INNER_JOIN' && /LEFT\s+JOIN/i.test(trimmed)) continue;

      findings.push({
        file: relativePath,
        line: index + 1,
        type: rule.type,
        risk: adjustRiskForContext(rule.risk, relativePath, trimmed),
        impact: rule.impact,
        suggestion: rule.suggestion,
        excerpt: trimmed.slice(0, 240),
      });
    }
  });

  return findings;
};

const groupAreasNeedingAdjustment = (findings: RiskFinding[]): string[] => {
  const areaByPath = new Set<string>();

  for (const finding of findings) {
    if (finding.risk === 'BAIXO') continue;
    const fileName = finding.file.split('/').pop() ?? finding.file;
    areaByPath.add(fileName);
  }

  return [...areaByPath].sort();
};

const detectSafeAreas = (findings: RiskFinding[]): string[] => {
  const highOrMediumFiles = new Set(
    findings
      .filter((finding) => finding.risk !== 'BAIXO')
      .map((finding) => finding.file)
  );

  const candidates = [
    { label: 'financeiro backend', files: ['backend/src/services/financialService.ts', 'backend/src/services/eventsService.ts'] },
    { label: 'relatórios do organizador', files: ['backend/src/services/reportsService.ts', 'src/components/organizer/EventDetailedReport.tsx'] },
    { label: 'listagem de inscrições', files: ['backend/src/services/registrationsService.ts', 'src/components/organizer/OrganizerRegistrations.tsx'] },
    { label: 'checkin/validação', files: ['src/pages/ValidateRegistration.tsx', 'src/pages/RegistrationQRCode.tsx'] },
  ];

  return candidates
    .filter((candidate) => candidate.files.every((file) => !highOrMediumFiles.has(file)))
    .map((candidate) => candidate.label);
};

const buildRecommendation = (findings: RiskFinding[]): string[] => {
  const recommendations = new Set<string>();
  if (findings.some((finding) => finding.type === 'INNER_JOIN' && finding.risk !== 'BAIXO')) {
    recommendations.add('Substituir INNER JOIN/JOIN obrigatório com event_kits/kits por LEFT JOIN nas listagens, relatórios e exports.');
  }
  if (findings.some((finding) => finding.type === 'NULL_FILTER' && finding.risk !== 'BAIXO')) {
    recommendations.add('Remover ou isolar filtros kit_id IS NOT NULL que escondem inscrições restauradas com kit_id NULL.');
  }
  if (findings.some((finding) => finding.type === 'REQUIRED_RENDER' && finding.risk !== 'BAIXO')) {
    recommendations.add('Aplicar optional chaining/fallback textual "Kit removido" ou "Sem kit" em renderizações.');
  }
  recommendations.add('Antes do restore, ajustar riscos ALTO/MÉDIO e repetir esta análise para validar compatibilidade.');
  return [...recommendations];
};

export default async function run(): Promise<NullKitCompatibilityReport> {
  const repoRoot = findRepoRoot();
  const roots = [
    path.join(repoRoot, 'backend', 'src'),
    path.join(repoRoot, 'src'),
  ].filter((root) => fs.existsSync(root));
  const files = roots.flatMap(walkFiles);
  const findings = files.flatMap((file) => analyzeFile(repoRoot, file));

  const totals: Record<RiskLevel, number> = {
    ALTO: 0,
    MÉDIO: 0,
    BAIXO: 0,
  };

  for (const finding of findings) {
    totals[finding.risk]++;
  }

  return {
    generated_at: new Date().toISOString(),
    scope: {
      roots_scanned: roots.map((root) => normalizePath(repoRoot, root)),
      files_scanned: files.length,
    },
    totals,
    findings: findings.sort((a, b) => {
      const riskOrder: Record<RiskLevel, number> = { ALTO: 0, MÉDIO: 1, BAIXO: 2 };
      return riskOrder[a.risk] - riskOrder[b.risk] || a.file.localeCompare(b.file) || a.line - b.line;
    }),
    safe_areas: detectSafeAreas(findings),
    areas_needing_adjustment: groupAreasNeedingAdjustment(findings),
    recommendation: buildRecommendation(findings),
    safety: {
      read_only: true,
      inserts: false,
      updates: false,
      deletes: false,
      alters: false,
      restore_executed: false,
    },
  };
}
