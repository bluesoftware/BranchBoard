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
  notServerMode: "BranchBoard: tryb przechowywania nie jest ustawiony na „Serwer”. Zmień go w ustawieniach, aby łączyć się przez SSH.",
  deleteTaskConfirm: 'Usunąć zadanie "{title}"?',
  deleteUserConfirm: 'Usunąć użytkownika "{name}"? Zadania przypisane do niego zostaną odznaczone.',
  delete: "Usuń",
  yes: "Tak",
  prefix: "BranchBoard: {message}",
};

export type ExtMessages = typeof pl;
