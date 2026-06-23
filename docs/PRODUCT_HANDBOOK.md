# BranchBoard Product Handbook

BranchBoard jest narzedziem pracy dla malego zespolu developerskiego. Jego
glowna obietnica jest prosta:

> Jedna karta opisuje prace, jeden branch zawiera kod, a zespol widzi realny
> status bez pytania "na jakim branchu to jest?".

To nie jest system do kontroli ludzi. To jest panel do kontroli przeplywu pracy:
zadania, branchy, review, DEV, ryzyk, deploymentow i AI-generated code.

## Dla Kogo

BranchBoard najlepiej pasuje do:

- zespolow 2-10 developerow,
- software house i freelancerow prowadzacych kilka mniejszych projektow,
- zespolow pracujacych w Cursorze albo VS Code,
- projektow, gdzie kazde zadanie powinno miec branch,
- repozytoriow legacy, gdzie liczy sie bezpieczny, maly zakres zmian,
- teamow korzystajacych z agentow AI i potrzebujacych kontroli kosztu oraz
  review.

Nie probuje zastapic pelnego Jira/Linear/YouTrack. BranchBoard jest blisko kodu
i ma pomagac w codziennej egzekucji.

## Najwazniejsze Zasady Pracy

1. **Task i branch sa jednym obiektem pracy.**
   Karta bez brancha to jeszcze plan. Karta z branchem to konkretna praca w
   repozytorium.

2. **Kolumna opisuje etap workflow, a badge brancha opisuje prawde Git.**
   Karta moze byc w "Code Review", ale branch nadal moze byc tylko lokalny.
   BranchBoard rozdziela intencje procesu od realnego stanu repo.

3. **Ruch karty moze byc operacja.**
   Przeniesienie taska moze uruchomic WIP limit, hook komendy, checkout, push,
   merge do DEV albo flow produkcyjny, jesli konfiguracja na to pozwala.

4. **Produkcja wymaga udanego Git flow.**
   BranchBoard nie powinien oznaczac zadania jako zakonczonego, jesli merge,
   push, test command albo confirmation nie przeszly.

5. **AI nie jest osobnym swiatem.**
   Prompt, plan, output, review, changed files, token usage i koszt sa czescia
   taska, a nie historia z zewnetrznego czatu.

## Widoki Produktu

### Board

Glowne miejsce pracy. Uzywaj go do:

- tworzenia i porzadkowania zadan,
- zmiany kolumn,
- przypisywania osob,
- komentowania,
- prowadzenia checklist,
- laczenia z branchem,
- uruchamiania akcji Git i AI z task drawer.

Board jest najlepszy do planowania i synchronizacji zespolu.

### Today

Widok osobisty lub zespolowy na prace terminowa:

- overdue,
- dzis,
- najblizsze 3 dni,
- tydzien,
- zakres custom,
- zadania bez daty.

Uzywaj go na poczatku dnia, zeby wybrac realny zakres pracy.

### Current Branch

Widok "co teraz robie". BranchBoard patrzy na aktualnie checkoutowany branch i
pokazuje:

- powiazany task,
- status Git,
- zmienione pliki,
- commity,
- ryzyko,
- work log,
- checklist,
- komentarze,
- AI Agent panel,
- nastepna sugerowana akcje.

To jest najlepszy widok dla developera w trakcie pracy.

### Command Center

Widok seniora, tech leada albo CTO. Pokazuje stan przeplywu:

- Overview,
- Team,
- Branch Flow,
- Cleanup,
- Deployments,
- Files & Commits,
- Risk Radar,
- Impact,
- Activity,
- AI Review.

Uzywaj go do sprawdzenia, gdzie blokuje sie praca, ktore branche sa ryzykowne i
co jest gotowe do dalszego etapu.

### Branch Map

Mapa Git. Uzywaj jej, gdy trzeba zrozumiec historie commitow, rozjazdy branchy i
relacje miedzy praca na boardzie a realnym grafem repozytorium.

## Proponowany Rytm Dnia

### Developer

1. Otworz Today i sprawdz swoje zadania.
2. Przejdz do Current Branch.
3. Jesli pracujesz nad nowym taskiem, utworz lub checkoutuj branch z karty.
4. Dopisz acceptance criteria, checklist i file mentions, jesli task jest
   niejasny.
5. Po zmianach pushnij branch i przenies karte do review.
6. Jesli uzywasz AI, najpierw Plan, potem Work, potem Review.

### Senior / Tech Lead

1. Otworz Command Center -> Overview.
2. Sprawdz "Needs attention".
3. Wejdz w Branch Flow: local-only, not pushed, stale, ready to merge.
4. Wejdz w Risk Radar dla branchy wysokiego ryzyka.
5. Sprawdz Deployments: co jest na DEV i czy zostalo przetestowane.
6. Uzyj Team view do wykrycia blokad, nie do oceniania ludzi.

### Product / Project Owner

1. Patrz na Board i Today.
2. Nie interpretuj "aktywnych branchy" jako mikrozarzadzania.
3. Uzywaj komentarzy, acceptance criteria i due date.
4. W razie watpliwosci pytaj o karte, nie o prywatny status developera.

## Definicja Gotowosci

Task jest gotowy do pracy, gdy ma:

- jasny tytul,
- opis lub acceptance criteria,
- osobe odpowiedzialna albo swiadomie brak assignee,
- typ zadania (`feature`, `bugfix`, `hotfix`, `chore`, `refactor`, `docs`),
- opcjonalnie pliki przez `@file` mentions,
- branch albo etap, ktory branch utworzy.

Task jest gotowy do review, gdy:

- branch jest wypchniety na `origin`,
- checklist jest aktualny,
- komenda rules/test/build przeszla albo wynik jest opisany,
- AI result/review jest wklejony, jesli praca byla AI-assisted.

Task jest gotowy do produkcji, gdy:

- branch jest zintegrowany z dev/staging, jesli projekt uzywa `devBranch`,
- DEV deploy jest wykonany i oznaczony jako tested, jesli projekt wymaga DEV,
- merge do production branch jest potwierdzony,
- `runCommandBeforeFinish` przechodzi,
- push do `origin/main` albo skonfigurowanego production branch konczy sie
  sukcesem.

## Kolumny Jako Workflow

Domyslne kolumny sa etapami procesu:

| Kolumna | Znaczenie | Git stage |
| --- | --- | --- |
| Backlog | Pomysly i praca jeszcze niegotowa | none |
| To Do | Gotowe do podjecia | none |
| AI Agent | Zadania przygotowane pod agenta AI | ai-agent |
| In Progress | Praca lokalna na branchu | feature |
| Code Review | Branch wypchniety, oczekuje review | review |
| Testing | Integracja na DEV/staging | staging |
| Done | Produkcja / zamkniete | production |

Nazwy mozna zmieniac, ale sens etapow powinien zostac czytelny.

## Jak Uzywac AI Bez Chaosu

Rekomendowany flow:

1. Doprecyzuj task: opis, acceptance criteria, checklist, pliki.
2. Wybierz agenta i model.
3. Uzyj AI Cost Guard, jesli pytanie moze wymagac duzego kontekstu.
4. Uruchom Plan i przeczytaj go przed Work.
5. Uruchom Work tylko na czystym working tree, jesli wymagaja tego ustawienia.
6. Uruchom Review.
7. Zostaw wynik AI i koszt przy tasku.
8. Developer nadal odpowiada za finalny kod.

AI Agent w BranchBoard nie merge'uje, nie pushuje, nie deployuje i nie usuwa
branchy. Te decyzje zostaja w Git flow.

## Jak Uzywac Powiadomien

Powiadomienia sa persisted w board data, wiec moga synchronizowac sie przez
local JSON albo server mode:

- nowe zadanie,
- komentarz,
- przypisanie,
- push brancha,
- merge success/failure,
- task moved to review,
- task done,
- admin announcement.

W ustawieniach mozna wlaczyc/wylaczyc toast VS Code, dzwiek i konkretne typy
zdarzen.

## Co BranchBoard Celowo Nie Robi

- Nie usuwa branchy bez potwierdzenia.
- Nie merge'uje do main, gdy `allowDirectMergeToMain` jest wylaczone.
- Nie robi fetch/pull/push podczas samego ogladania dashboardow.
- Nie wymysla kosztow AI, gdy agent nie podal usage albo nie ma pricing.
- Nie nadpisuje pustym boardem istniejacego server board bez specjalnego
  ustawienia.
- Nie probuje byc pelnym systemem HR/performance tracking.

## Minimalny Setup Dla Zespolu

1. Ustal `defaultMainBranch`, `devBranch` i `remoteName`.
2. Ustal czy `allowDirectMergeToMain` ma byc wlaczone.
3. Skonfiguruj `runCommandBeforeFinish`, np. build/test.
4. Ustal czy DEV deploy ma miec `devDeployCommand`.
5. Wlacz server mode, jesli zespol ma wspolna tablice.
6. Dodaj uzytkownikow recznie lub przez sync z Git.
7. Ustal, ktore AI agenty sa dozwolone.
8. Przejrzyj `allowedCommands` i `allowedAIAgentCommands`.

## Wersja Produktowa W Jednym Zdaniu

BranchBoard daje malemu zespolowi developerskiemu wspolny obraz pracy, ktory
wynika z realnego Git, a nie z recznie aktualizowanej tablicy obok kodu.
