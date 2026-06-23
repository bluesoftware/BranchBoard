/** Polish messages used on the extension host side (VS Code notifications). */
export const pl = {
  needWorkspace:
    "BranchBoard potrzebuje otwartego folderu/workspace. Otwórz folder projektu i spróbuj ponownie.",
  finishHint: "Użyj przycisku „Zakończ zadanie” na karcie zadania, aby zakończyć je bezpiecznie.",
  serverInvalid: "BranchBoard: nieprawidłowa konfiguracja serwera — {error}. Używam lokalnego JSON.",
  serverUnreachable:
    "BranchBoard: nie można połączyć się z serwerem przez SSH — {error}. Używam lokalnego JSON, dopóki serwer nie będzie dostępny.",
  loadFailed: "BranchBoard: nie udało się wczytać tablicy — {error}",
  syncFailed: "BranchBoard: synchronizacja nie powiodła się — {error}",
  taskTitlePrompt: "Tytuł zadania",
  selectTaskBranch: "Wybierz branch zadania do przełączenia",
  noGitRepo: "BranchBoard: brak repozytorium Git w tym workspace.",
  branchNotPushedPublic:
    "To zadanie nie ma jeszcze publicznie wypchniętego brancha na {remote}. Najpierw wypchnij branch.",
  productionRollbackLocked:
    "Na serwerze produkcyjnym z lokalnym SQLite nie można cofać zadań z Produkcji. Cofnij je z lokalnego klienta po SSH.",
  productionChecklistIncomplete:
    "Nie można przenieść zadania na Produkcję, dopóki wszystkie podzadania nie są zakończone.",
  productionChecklistLocked:
    "Podzadania w kolumnie Produkcja są zablokowane i nie można ich edytować.",
  productionRollbackNeedsBranch:
    "Aby cofnąć zadanie z Produkcji, zadanie musi mieć przypisany branch.",
  productionRollbackRecreated:
    "Branch '{branch}' nie istniał już lokalnie ani na {remote}, więc został odtworzony od aktualnego '{main}' — można na nim wznowić pracę. Nic na {remote}/{main} nie zostało usunięte.",
  usersImported: "BranchBoard: zaimportowano {count} użytkownik(ów) z Git.",
  usersUpToDate: "BranchBoard: użytkownicy są aktualni względem Git.",
  userSyncFailed: "BranchBoard: synchronizacja użytkowników nie powiodła się — {error}",
  selectSshKey: "Wybierz klucz prywatny SSH do połączeń Git / serwera",
  sshDefault: "Domyślny (agent SSH / ~/.ssh/config)",
  sshClear: "Wyczyść skonfigurowany klucz",
  sshBrowse: "Przeglądaj…",
  sshBrowseHint: "Wybierz plik klucza z dowolnej lokalizacji",
  sshUseKey: "Użyj tego klucza SSH",
  sshReadFail: "BranchBoard: nie udało się odczytać {dir}. Czy folder .ssh istnieje?",
  sshUsing: "BranchBoard: używam klucza SSH {key}",
  sshCleared: "BranchBoard: wyczyszczono klucz SSH (używam domyślnego).",
  retry: "Ponów",
  selectSshKeyAction: "Wybierz klucz SSH",
  openSettings: "Otwórz ustawienia",
  serverReconnected: "BranchBoard: połączono z serwerem (SSH / SQLite). Tablica wczytana ze wspólnej bazy.",
  serverNoBoardMessage:
    "BranchBoard: połączono z serwerem, ale nie ma na nim jeszcze żadnej tablicy. Nic nie zostało zapisane. Utwórz nową tablicę, aby zacząć.",
  serverNoBoardCreate: "Utwórz tablicę",
  notServerMode: "BranchBoard: tryb przechowywania nie jest ustawiony na „Serwer”. Zmień go w ustawieniach, aby łączyć się przez SSH.",
  deleteTaskConfirm: 'Usunąć zadanie "{title}"?',
  deleteUserConfirm: 'Usunąć użytkownika "{name}"? Zadania przypisane do niego zostaną odznaczone.',
  delete: "Usuń",
  yes: "Tak",
  prefix: "BranchBoard: {message}",
  notifTaskCreatedTitle: "Nowe zadanie",
  notifTaskCreatedBody: 'Utworzono nowe zadanie: "{title}"',
  notifCommentAddedTitle: "Nowa wiadomość w czacie",
  notifCommentAddedBody: 'Nowa wiadomość w czacie zadania "{title}"',
  notifAssignedTitle: "Przypisano do Ciebie",
  notifAssignedBody: 'Przypisano Cię do "{title}"',
  notifBranchPushedTitle: "Branch wypchnięty",
  notifBranchPushedBody: "Branch {branch} został wypchnięty na zdalne repozytorium.",
  notifMergeFinishedTitle: "Scalenie zakończone",
  notifMergeFinishedBody: '"{title}" zostało pomyślnie scalone.',
  notifMergeFailedTitle: "Scalenie nie powiodło się",
  notifMergeFailedBody: 'Zakończenie/scalenie "{title}" nie powiodło się — sprawdź szczegóły błędu.',
  notifTaskMovedToReviewTitle: "Gotowe do review",
  notifTaskMovedToReviewBody: '"{title}" przeniesiono do review/testów.',
  notifTaskDoneTitle: "Zadanie zrobione",
  notifTaskDoneBody: '"{title}" oznaczono jako zrobione.',
  notifOpenTaskAction: "Otwórz zadanie",
  "aiAgent.promptGenerated": "Prompt AI Agent został wygenerowany.",
  "aiAgent.confirmRunTitle": "Uruchomić agenta AI dla tego zadania?",
  "aiAgent.confirmRunAction": "Uruchom agenta",
  "aiAgent.confirmRunDetail":
    "Agent może zmienić lokalne pliki na wskazanym branchu. BranchBoard nie wykona push, merge, deploy ani usuwania branchy.",
  "aiAgent.noAgentSelected": "Wybierz przynajmniej jednego aktywnego agenta AI przed uruchomieniem.",
  "aiAgent.dirtyTree": "Masz lokalne zmiany. Commit/stash przed uruchomieniem agenta.",
  "aiAgent.agent": "Agent",
  "aiAgent.command": "Komenda",
  "aiAgent.branch": "Branch",
  "aiAgent.promptFile": "Plik prompta",
  "aiAgent.cancelled": "Uruchomienie agenta zostało anulowane.",
  "aiAgent.rejected": "Wynik AI został odrzucony przez użytkownika.",
  "aiAgent.moveMissingConfig":
    "Najpierw włącz obsługę przez AI i wybierz agenta w drawerze zadania.",
  "aiAgent.commandBlocked": "Komenda agenta AI '{command}' nie jest dozwolona.",
  "aiAgent.commandBlockedDetail":
    "Dodaj dokładną nazwę binarki albo ścieżkę absolutną do branchBoard.allowedAIAgentCommands tylko wtedy, gdy jej ufasz.",
  "aiAgent.commandMissing": "Nie znaleziono komendy agenta AI '{command}'.",
  "aiAgent.commandMissingDetail":
    "Zainstaluj CLI agenta albo ustaw branchBoard.aiAgents na istniejącą binarkę. BranchBoard sprawdził PATH i typowe foldery narzędzi: {paths}",
  "aiAgent.commandMissingAbsoluteDetail":
    "Skonfigurowana ścieżka absolutna nie istnieje albo nie jest wykonywalna. Zainstaluj CLI agenta albo popraw branchBoard.aiAgents i branchBoard.allowedAIAgentCommands.",
  "aiAgent.timedOut": "Agent nie odpowiedział w ciągu {seconds}s i został zatrzymany.",
  "aiAgent.cancelledByUser": "Agent został zatrzymany przez użytkownika.",
  "aiAgent.modelsNoListCommand":
    "Agent '{name}' nie ma skonfigurowanej komendy listowania modeli (listModelsArgs) — dodaj ją w branchBoard.aiAgents, jeśli CLI to wspiera.",
  "aiAgent.modelsFetchFailed": "Nie udało się pobrać listy modeli dla agenta '{name}'.",
  "aiAgent.modelsUnparseable":
    "CLI agenta '{name}' zwróciło wynik, którego nie udało się rozpoznać jako listy modeli.",
  "aiAgent.alreadyRunning": "Agent już pracuje na tym zadaniu — zaczekaj na zakończenie albo go zatrzymaj.",
  "aiAgent.stopRequested": "Wysłano żądanie zatrzymania agenta.",
  "aiAgent.noActiveRun": "Ten agent nie jest aktualnie uruchomiony.",
  "aiAgent.consoleResultHeading": "Wynik",
  "aiAgent.consoleUsageLine":
    "📊 Tokeny: wejście {input} • wyjście {output} • cache odczyt {cacheRead} • cache zapis {cacheWrite}",
  "aiAgent.optimizeFailed": "Optymalizacja promptu agentem '{name}' nie powiodła się — użyto oryginalnego promptu.",
  "aiAgent.optimizeEmpty": "Agent '{name}' zwrócił pusty wynik optymalizacji promptu — użyto oryginalnego promptu.",
  "aiAgent.promptOptimized": "Prompt został zoptymalizowany przed wysłaniem (model: {name}).",
};

export type ExtMessages = typeof pl;
