# BranchBoard Documentation

Ten katalog jest glowna mapa dokumentacji BranchBoard. Projekt urosl z prostego
Kanbana do narzedzia pracy developerskiej: tablica, Git workflow, Command
Center, Branch Map, Current Branch, Today, AI Agent workflow, deploye,
powiadomienia, server mode i warstwa bezpieczenstwa.

## Najszybsza Sciezka

Jesli chcesz szybko zrozumiec produkt:

1. [PRODUCT_HANDBOOK.md](PRODUCT_HANDBOOK.md) - jak zespol powinien pracowac z
   BranchBoard na co dzien.
2. [WORKFLOW.md](WORKFLOW.md) - podstawowy przeplyw zadanie -> branch -> review
   -> DEV -> produkcja.
3. [COMMAND_CENTER.md](COMMAND_CENTER.md) - widok seniora / CTO i dashboardy
   operacyjne.
4. [SAFETY.md](SAFETY.md) - zasady bezpiecznego Git i automatyzacji.
5. [AI_WORKFLOW.md](AI_WORKFLOW.md) - prompty, AI Agent, Cursor sub-agents i
   AI Cost Guard.

Jesli rozwijasz rozszerzenie:

1. [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) - architektura
   extension side, WebView, storage, serwisy i message protocol.
2. [SETTINGS_REFERENCE.md](SETTINGS_REFERENCE.md) - pelna mapa ustawien
   `branchBoard.*`.
3. [SERVER_MODE.md](SERVER_MODE.md) - SQLite/SSH, relacyjne tabele, fallback i
   test polaczenia.
4. [COLUMN_WORKFLOW.md](COLUMN_WORKFLOW.md) - Git stage kolumn i hooki komend.
5. [DEPLOYMENTS.md](DEPLOYMENTS.md) - DEV/staging/production commands.

## Dokumenty Produktowe

- [PRODUCT_HANDBOOK.md](PRODUCT_HANDBOOK.md) - product operating manual dla
  malego zespolu.
- [SELLING_POINTS.md](SELLING_POINTS.md) - pozycjonowanie, wartosc i komu to
  sprzedawac.
- [CTO_WORKFLOW.md](CTO_WORKFLOW.md) - codzienny rytm seniora / CTO.
- [TOOLTIPS_AND_HELP.md](TOOLTIPS_AND_HELP.md) - filozofia help-first UI.

## Dokumenty Workflow

- [WORKFLOW.md](WORKFLOW.md) - pelny task/branch workflow.
- [CURRENT_BRANCH.md](CURRENT_BRANCH.md) - widok aktualnego brancha.
- [BRANCH_FLOW.md](BRANCH_FLOW.md) - branch pipeline i cleanup.
- [BRANCH_MAP.md](BRANCH_MAP.md) - mapa branchy i commit graph.
- [COLUMN_WORKFLOW.md](COLUMN_WORKFLOW.md) - automatyzacja kolumn, WIP limits,
  Git mapping i command hooks.

## Dokumenty Techniczne

- [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) - najwazniejszy
  dokument dla developera.
- [SETTINGS_REFERENCE.md](SETTINGS_REFERENCE.md) - ustawienia pogrupowane po
  obszarach produktu.
- [SERVER_MODE.md](SERVER_MODE.md) - storage server mode.
- [SAFETY.md](SAFETY.md) - Git, komendy, working tree i storage safety.
- [ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md) - backup branch, tagi, rollback i
  rzeczy, ktorych BranchBoard nie robi automatycznie.
- [DEPLOYMENTS.md](DEPLOYMENTS.md) - komendy deploy, URL templates i zapis
  wynikow.
- [AI_WORKFLOW.md](AI_WORKFLOW.md) - AI prompts, AI Agent, modele, koszty i
  lokalny optimizer.

## Co Jest Zaimplementowane Teraz

Aktualny kod zawiera:

- Activity Bar WebView i osobny panel.
- Board, Today, Current Branch, Command Center i Branch Map.
- Local JSON storage z watcherem, migracja i backupem.
- Server mode SQLite przez lokalny shell albo SSH.
- BoardService jako jedyne miejsce mutacji board data.
- GitService jako bezpieczna warstwa `git`.
- DashboardService, BranchAnalyticsService i RiskService dla computed
  analytics.
- AIAgentService, AiCostOptimizer i CursorAgentsService dla workflow AI.
- DeploymentService i SafetyService dla DEV/prod/rollback.
- NotificationService oraz persisted `notifications[]`.
- TitleBarService i BranchStatusBarService dla natywnej chromy VS Code/Cursor.
- i18n po stronie extension i WebView.

## Status Dokumentacji

Dokumentacja jest utrzymywana jako dokumentacja produktu i architektury. Nie
opisuje kazdego prywatnego helpera, ale powinna jasno odpowiadac na pytania:

- jak zespol ma uzywac BranchBoard,
- jak bezpiecznie przejsc od taska do produkcji,
- gdzie zyja dane,
- ktory serwis odpowiada za ktora warstwe,
- jakie ustawienia sa wazne,
- jakie ograniczenia sa celowe.

## Komendy Developerskie

```bash
npm install
cd webview
npm install
npm run build
cd ..
npm run compile
```

Uruchomienie w Extension Development Host: `F5` w VS Code.

Pakowanie:

```bash
npm install -g @vscode/vsce
vsce package
```
