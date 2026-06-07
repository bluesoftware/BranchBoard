# BranchBoard dla seniora / CTO

*A senior / tech-lead guide — polski poniżej, English further down.*

---

## Po co to jest (PL)

BranchBoard powstał z jednej obserwacji: w małym zespole programistów nie brakuje
pracy — brakuje **porządku wokół pracy**. Zadania żyją w jednym miejscu, branche w
drugim, wiedza o tym „co się właściwie dzieje z kodem" w głowach ludzi, a status
poznaje się dopiero na spotkaniu albo gdy coś pęknie na produkcji.

Command Center zamyka tę lukę. To lekkie centrum dowodzenia kodem wbudowane w
VS Code / Cursor, które łączy tablicę Kanban z prawdziwym stanem repozytorium:
zadanie ma swój branch, branch ma swoje commity, push, deploy na DEV, review,
testy i bezpieczny merge do main. Wszystko w jednym widoku.

To nie jest druga Jira i nie jest to system do zarządzania ludźmi. To narzędzie,
które odpowiada na pytanie *„w jakim stanie jest projekt?"* — bez pytania o to
nikogo z osobna.

## Czym to NIE jest

Powiedzmy to wprost, bo to fundament całej filozofii produktu: **BranchBoard nie
służy do rozliczania programistów z godzin.** Nie ma tu stopera, nie ma raportów
„kto ile siedział", nie ma rankingu wydajności. Liczby, które widzisz — dni bez
ruchu, liczba commitów, rozmiar zmian, ryzyko — opisują **stan zadania i kodu**,
nie wartość człowieka.

Widok zespołu ma w interfejsie zdanie, które jest tam celowo:

> „Ten widok pomaga wykrywać blokady, a nie oceniać ludzi."

To nie ozdoba. To umowa społeczna, na której stoi adopcja narzędzia w zespole.
Jeśli ludzie poczują stoper, schowają pracę. Jeśli poczują porządek, zaczną z
niego korzystać.

## Pełny flow

Sercem produktu jest jeden, przewidywalny przepływ — ten sam dla programisty,
agenta AI i lidera:

1. **Zadanie** trafia na tablicę (tytuł, opis, priorytet, termin, osoba).
2. Z zadania powstaje **branch** — jedno zadanie, jeden branch.
3. Programista pracuje: **commity → push**. BranchBoard widzi to z lokalnego
   repozytorium, bez sieci i bez integracji z zewnętrznym serwerem.
4. Branch leci na **DEV** jedną komendą (konfigurowalną), tester klika
   „przetestowane".
5. Zadanie przechodzi przez **review** i **testy**.
6. **Bezpieczny merge do main** — z potwierdzeniem, opcjonalnym backupem brancha i
   tagiem bezpieczeństwa, nigdy bez czystego working tree.
7. Zadanie ląduje w „Zrobione", a cała historia zostaje w **Aktywności**.

W „Przepływie branchy" ten cykl widać jako pasek:
`Zadanie → Branch → Commity → Push → DEV → Review → Testy → Merge`, gdzie każdy
etap świeci kolorem stanu. Senior w 10 sekund widzi, gdzie jest zator.

## Co realnie daje zespołowi

Programiście Command Center oszczędza kontekstu: jego zadanie, jego branch i
gotowy prompt dla agenta AI są w jednym miejscu, a ryzykowne operacje Git mają
siatkę bezpieczeństwa. Mniej „gdzie ja to miałem", mniej strachu przed merge.

Liderowi daje **obraz bez przesłuchania**. Risk Radar sam podnosi rękę, gdy
branch puchnie ponad 20 plików, stoi za main, dotyka płatności albo zadanie AI
nie ma checklisty review. Zespół pokazuje, kto czeka na review i gdzie robi się
wąskie gardło. „Co wymaga uwagi" zbiera to, co naprawdę wymaga decyzji — resztę
zostawia w spokoju.

A skoro praca dzieje się na branchach i tak — to po prostu **widać, że się
dzieje**. Nie dlatego, że ktoś musi się tłumaczyć, tylko dlatego, że projekt jest
przejrzysty. Zaufanie jest tu założeniem domyślnym: lider nie pyta „nad czym
pracujesz?", bo i tak widzi, że coś rośnie na branchu — i może spokojnie założyć,
że idzie w dobrą stronę. Ten spokój działa w obie strony. Zespół, który wie, że
jego praca jest widoczna jako *postęp*, a nie jako *rozliczenie*, pracuje
swobodniej, nie pod presją stopera. Mniej statusów na spotkaniach, mniej „daj
znać jak skończysz", więcej realnej roboty. Widoczność, która buduje zaufanie,
zamiast je podgryzać.

## Codzienny rytm seniora

Rano otwierasz Command Center zamiast pisać „jak postępy?" na pięciu kanałach.
Risk Radar mówi, co jest ryzykowne. Zespół mówi, kto jest przeciążony i kto czeka
na review. Przepływ branchy mówi, co jest gotowe na DEV i co czeka na merge.
Jednym kliknięciem wysyłasz branch na DEV albo otwierasz zadanie i dopisujesz
komentarz. Reszta dnia jest Twoja — i ich.

## Dlaczego warto to włączyć

Bo koszt jest zerowy, a porządek natychmiastowy. Działa lokalnie na Twoim
repozytorium, nie wymaga serwera, nie wysyła nic na zewnątrz, analityka Git jest
tylko-do-odczytu i nigdy nie robi `fetch`. Włączasz, otwierasz „Centrum
dowodzenia" i od pierwszej minuty widzisz projekt, którego wcześniej trzeba było
się domyślać. Spróbuj przez jeden sprint — przestaniesz pytać o status, bo
będziesz go po prostu widział.

---

## For seniors / CTOs (EN)

BranchBoard exists to fix one thing small teams rarely lack work but always lack:
**order around the work.** Tasks live in one place, branches in another, and the
real state of the code lives in people's heads until the next standup or the next
production incident.

The Command Center closes that gap inside VS Code / Cursor. It ties a Kanban
board to the real repository state: one task, one branch, its commits, push, DEV
deploy, review, testing and a safe merge to main — in a single view.

**What it is not:** a way to track hours or police developers. There is no timer,
no "who-sat-how-long" report, no productivity ranking. The numbers you see —
days idle, commit count, change size, risk — describe the **state of the task and
the code**, not the worth of a person. The team view says it out loud: *"This view
helps detect bottlenecks, not judge people."* That sentence is the social contract
the whole tool stands on.

**The flow** is the same for a developer, an AI agent and a lead: task → branch →
commits → push → DEV → review → testing → safe merge, with a backup branch and a
clean-tree guard before main. The Branch Flow view renders it as a colour-coded
pipeline so a lead sees the bottleneck in ten seconds.

**What it gives the team:** developers keep their task, branch and AI prompt in one
place, with a safety net around risky Git. Leads get *a picture without an
interrogation* — Risk Radar raises its own hand, the team view shows who waits on
review, and "Needs attention" surfaces only what needs a decision.

And because the work happens on branches anyway, you can simply **see that it's
happening** — not so anyone has to explain themselves, but because the project is
transparent. Trust is the default here: a lead doesn't ask "what are you working
on?" because they can already see something growing on a branch, and can calmly
assume it's heading the right way. That calm runs both ways. A team whose work is
visible as *progress* rather than *accounting* works more freely, without a
stopwatch over its shoulder — fewer status updates, more real work. Visibility
that builds trust instead of eroding it.

It runs locally, needs no server, sends nothing out, and its Git analytics are
read-only. Turn it on, open the Command Center, and from minute one you can see
the project you used to have to guess at. Try it for one sprint — you'll stop
asking for status because you'll simply have it.
