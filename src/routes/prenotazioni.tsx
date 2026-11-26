function BookingDetail({
  booking,
  onClose,
  canCancel,
  canPrepay,
}: {
  booking: Booking | null;
  onClose: () => void;
  canCancel: boolean;
  canPrepay: boolean;
}) {
  const db = useDB();
  const [confirm, setConfirm] = useState(false);
  const [scope, setScope] = useState<SeriesScope>("this");
  const [editing, setEditing] = useState(false);
  const [eStart, setEStart] = useState("");
  const [eDur, setEDur] = useState(90);
  const [eCourt, setECourt] = useState("");
  const [participants, setParticipants] = useState<Player[]>([]);
  const [bookingPriceValue, setBookingPriceValue] = useState("0");
  const [payOpen, setPayOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<"contanti" | "carta" | "misto">("carta");
  const [payCash, setPayCash] = useState("0");

  useEffect(() => {
    if (!booking) return;

    setScope("this");
    setEditing(false);
    setEStart(booking.start);
    setEDur(toMin(booking.end) - toMin(booking.start));
    setECourt(booking.courtId);
    setBookingPriceValue(String(booking.price));

    const courtType = db.courts.find((c) => c.id === booking.courtId)?.type;
    const isPadel = courtType === "padel";
    const maxParticipants = courtType === "beach" ? 12 : 4;
    const count = isPadel
      ? 4
      : Math.max(
          2,
          Math.min(
            maxParticipants,
            booking.participants?.length || booking.players.length || 2,
          ),
        );

    const initialPlayers: Player[] = Array.from({ length: count }, (_, index) => {
      const existing = booking.participants?.[index];

      return existing
        ? { ...existing, extras: [...(existing.extras ?? [])] }
        : {
            id: `booking-${booking.id}-player-${index + 1}`,
            name: booking.players[index] ?? "",
            quota: Math.round((booking.price / count) * 100) / 100,
            paid: false,
            extras: [],
          };
    });

    setParticipants(initialPlayers);
    setPayOpen(false);
    setPayIds([]);
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!booking) return null;

  const seriesCount = booking.seriesId
    ? db.bookings.filter((b) => b.seriesId === booking.seriesId && !b.cancelled).length
    : 0;

  const court = db.courts.find((c) => c.id === booking.courtId);
  const fixedParticipants = court?.type === "padel";
  const participantLimit = court?.type === "beach" ? 12 : 4;

  const parsedBookingPrice = Number(bookingPriceValue.replace(",", "."));
  const validBookingPrice =
    Number.isFinite(parsedBookingPrice) && parsedBookingPrice >= 0;
  const normalizedBookingPrice = validBookingPrice
    ? Math.round(parsedBookingPrice * 100) / 100
    : 0;

  const selectedPlayers = participants.filter(
    (player) => payIds.includes(player.id) && !player.paid,
  );

  const payTotal = Math.round(
    selectedPlayers.reduce(
      (sum, player) =>
        sum +
        player.quota +
        player.extras.reduce(
          (extraSum, extra) => extraSum + extra.price * extra.qty,
          0,
        ),
      0,
    ) * 100,
  ) / 100;

  const cashAmount = Number(payCash.replace(",", ".")) || 0;

  const updateParticipants = (next: Player[]) => {
    setParticipants(next);
  };

  const saveParticipants = () => {
    const names = participants.map((player) => player.name.trim());

    if (names.some((name) => !name)) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return false;
    }

    if (!validBookingPrice) {
      toast.error("Inserisci un costo totale valido e non negativo.");
      return false;
    }

    if (
      participants.some(
        (player) => !Number.isFinite(player.quota) || player.quota < 0,
      )
    ) {
      toast.error("Controlla gli importi delle quote: devono essere validi e non negativi.");
      return false;
    }

    const result = reservations.update(booking.id, {
      price: normalizedBookingPrice,
      participants,
      players: names,
    });

    if (!result.ok) {
      toast.error(result.error ?? "Impossibile salvare i partecipanti e le quote");
      return false;
    }

    toast.success("Costo totale, partecipanti e quote salvati");
    return true;
  };

  const addParticipant = () => {
    if (participants.length >= participantLimit || fixedParticipants) return;

    updateParticipants([
      ...participants,
      {
        id: `booking-${booking.id}-player-${Date.now()}`,
        name: "",
        quota: 0,
        paid: false,
        extras: [],
      },
    ]);
  };

  const removeParticipant = (playerId: string) => {
    if (
      fixedParticipants ||
      participants.length <= 2 ||
      participants.some((player) => player.paid)
    ) {
      return;
    }

    updateParticipants(participants.filter((player) => player.id !== playerId));
  };

  const saveEdit = () => {
    const c = db.courts.find((x) => x.id === eCourt);
    if (!c) return;

    const end = toHHMM(Math.min(OPEN_TO, toMin(eStart) + eDur));
    const newPrice = bookingPrice(c, eDur, booking.extras);

    const result = series.update(
      booking.id,
      {
        courtId: eCourt,
        start: eStart,
        end,
        price: newPrice,
      },
      booking.seriesId ? scope : "this",
    );

    if (!result.ok) {
      toast.error(result.error ?? "Modifica non riuscita");
      return;
    }

    setBookingPriceValue(String(newPrice));
    toast.success(`Aggiornati ${result.updated} blocchi`);
    setEditing(false);
  };

  const submitPrepayment = () => {
    if (!payIds.length) {
      toast.error("Seleziona almeno un partecipante da pagare.");
      return;
    }

    if (participants.some((player) => !player.name.trim())) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return;
    }

    if (!validBookingPrice) {
      toast.error("Inserisci un costo totale valido e non negativo.");
      return;
    }

    if (
      participants.some(
        (player) => !Number.isFinite(player.quota) || player.quota < 0,
      )
    ) {
      toast.error("Controlla gli importi delle quote: devono essere validi e non negativi.");
      return;
    }

    if (payTotal <= 0) {
      toast.error("Il totale selezionato deve essere maggiore di zero.");
      return;
    }

    if (
      payMethod === "misto" &&
      (cashAmount < 0 || cashAmount > payTotal)
    ) {
      toast.error("Controlla la ripartizione tra contanti e carta.");
      return;
    }

    const saved = reservations.update(booking.id, {
      price: normalizedBookingPrice,
      participants,
      players: participants.map((player) => player.name.trim()),
    });

    if (!saved.ok) {
      toast.error(saved.error ?? "Impossibile salvare le quote prima del pagamento");
      return;
    }

    const result = courtSessions.payBookingPlayers(
      booking.id,
      payIds,
      payMethod,
      payMethod === "misto"
        ? cashAmount
        : payMethod === "contanti"
          ? payTotal
          : 0,
      payMethod === "misto"
        ? Math.round((payTotal - cashAmount) * 100) / 100
        : payMethod === "carta"
          ? payTotal
          : 0,
    );

    if (!result.ok) {
      toast.error(result.error ?? "Pagamento non riuscito");
      return;
    }

    setParticipants((current) =>
      current.map((player) =>
        payIds.includes(player.id)
          ? { ...player, paid: true }
          : player,
      ),
    );

    toast.success(`Pagamento anticipato registrato: ${eur(payTotal)}`);
    setPayOpen(false);
    setPayIds([]);
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={booking.title}
        subtitle={`${court?.name ?? "Campo"} · ${booking.start} → ${booking.end}`}
        footer={
          canCancel && !booking.cancelled ? (
            <div className="grid grid-cols-2 gap-2">
              {editing ? (
                <Btn variant="primary" onClick={saveEdit}>
                  Salva modifiche
                </Btn>
              ) : (
                <Btn variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Modifica
                </Btn>
              )}
              <Btn variant="danger" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" /> Annulla
              </Btn>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex w-full flex-wrap items-center gap-2">
            <Badge tone={booking.cancelled ? "danger" : "primary"}>
              {booking.cancelled
                ? "ANNULLATA"
                : KIND_LABEL[booking.kind].toUpperCase()}
            </Badge>
            <Badge tone="neutral">{booking.date}</Badge>
            {booking.source === "ai" && <Badge tone="info">DA AI</Badge>}

            {canPrepay && participants.some((player) => !player.paid) && (
              <Btn
                variant="primary"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setPayIds(
                    participants
                      .filter((player) => !player.paid)
                      .map((player) => player.id),
                  );
                  setPayMethod("carta");
                  setPayCash("0");
                  setPayOpen(true);
                }}
              >
                <Euro className="size-4" /> PAGA
              </Btn>
            )}
          </div>
                    {booking.seriesId && booking.recurrence && (
            <Panel className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Repeat className="size-4 text-primary" /> Serie ricorrente ·{" "}
                {seriesCount} blocchi attivi
              </div>
              <div className="mono text-xs text-muted-foreground">
                {FREQ_LABEL[booking.recurrence.freq]} fino al{" "}
                {booking.recurrence.until}
                {booking.recurrence.exceptions.length > 0 &&
                  ` · eccezioni: ${booking.recurrence.exceptions.join(", ")}`}
              </div>
              <Field label="Applica modifiche / annullamento a">
                <Select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as SeriesScope)}
                >
                  <option value="this">Solo questo blocco</option>
                  <option value="future">Questo e i successivi</option>
                  <option value="all">Tutta la serie</option>
                </Select>
              </Field>
            </Panel>
          )}

          {editing && (
            <Panel className="space-y-3 p-4">
              <Field label="Campo">
                <Select
                  value={eCourt}
                  onChange={(e) => setECourt(e.target.value)}
                >
                  {db.courts
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ora inizio">
                  <Input
                    type="time"
                    step={1800}
                    value={eStart}
                    onChange={(e) => setEStart(e.target.value)}
                  />
                </Field>
                <Field label="Durata">
                  <Select
                    value={eDur}
                    onChange={(e) => setEDur(Number(e.target.value))}
                  >
                    {[60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Se anche un solo blocco va in conflitto, nessuna modifica viene
                applicata.
              </p>
            </Panel>
          )}

          <Panel className="space-y-3 p-4">
            <Row label="Campo" value={court?.name ?? "—"} />
            <Row
              label="Orario"
              value={`${booking.start} → ${booking.end}`}
            />
            <Field label="Costo totale prenotazione (€)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={bookingPriceValue}
                disabled={booking.cancelled}
                onChange={(e) => setBookingPriceValue(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Row label="Creata da" value={booking.createdBy} />
          </Panel>

          {!booking.cancelled && booking.kind !== "manutenzione" && (
            <WhatsAppShare
              title="Condividi su WhatsApp"
              text={bookingMessage(booking, court?.name ?? "Campo")}
            />
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="label-caps text-muted-foreground">
                Giocatori e quote
              </div>
              {!fixedParticipants &&
                participants.length < participantLimit &&
                !participants.some((player) => player.paid) &&
                !booking.cancelled && (
                  <Btn variant="outline" size="sm" onClick={addParticipant}>
                    <Plus className="size-3" /> Aggiungi
                  </Btn>
                )}
            </div>

            <div className="space-y-2">
              {participants.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-2"
                >
                  <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] text-primary">
                    {index + 1}
                  </span>
                  <Input
                    value={player.name}
                    placeholder={`Giocatore ${index + 1}`}
                    disabled={player.paid || booking.cancelled}
                    onChange={(event) =>
                      setParticipants((current) =>
                        current.map((item) =>
                          item.id === player.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="min-w-0"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(player.quota)}
                    disabled={player.paid || booking.cancelled}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setParticipants((current) =>
                        current.map((item) =>
                          item.id === player.id
                            ? {
                                ...item,
                                quota:
                                  event.target.value === ""
                                    ? 0
                                    : Number.isFinite(value)
                                      ? Math.max(0, Math.round(value * 100) / 100)
                                      : item.quota,
                              }
                            : item,
                        ),
                      );
                    }}
                    className="w-24 shrink-0"
                  />
                  {player.paid ? (
                    <Badge tone="success">PAGATO</Badge>
                  ) : (
                    <Badge tone="warning">DA PAGARE</Badge>
                  )}
                  {!fixedParticipants &&
                    participants.length > 2 &&
                    !participants.some((item) => item.paid) &&
                    !booking.cancelled && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        title="Rimuovi giocatore"
                        onClick={() => removeParticipant(player.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {court?.type === "padel"
                ? "Padel: 4 partecipanti obbligatori."
                : court?.type === "beach"
                  ? "Beach: da 2 a 12 partecipanti."
                  : "Tennis: da 2 a 4 partecipanti."}{" "}
              Puoi modificare manualmente ogni quota. Le quote non vengono
              ricalcolate quando aggiungi o rimuovi un partecipante.
            </p>

            {!booking.cancelled && (
              <Btn
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={saveParticipants}
              >
                Salva costo totale e quote
              </Btn>
            )}
          </div>

          {booking.extras.length > 0 && (
            <div>
              <div className="label-caps mb-2 text-muted-foreground">
                Extra
              </div>
              <div className="flex flex-wrap gap-2">
                {booking.extras.map((id) => (
                  <Badge key={id} tone="info">
                    {EXTRAS.find((e) => e.id === id)?.label ?? id}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {booking.note && (
            <p className="text-sm text-muted-foreground">
              Note: {booking.note}
            </p>
          )}
        </div>
      </Drawer>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pagamento anticipato"
        footer={
          <>
            <Btn variant="outline" onClick={() => setPayOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="primary"
              disabled={
                !payIds.length ||
                payTotal <= 0 ||
                !validBookingPrice ||
                (payMethod === "misto" &&
                  (cashAmount < 0 || cashAmount > payTotal))
              }
              onClick={submitPrepayment}
            >
              Registra pagamento · {eur(payTotal)}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seleziona i partecipanti che saldano ora. Puoi modificare le loro
            quote direttamente da questa finestra. Il totale si aggiorna
            automaticamente in base alle quote selezionate e agli eventuali
            extra.
          </p>

          <div className="space-y-2">
            {participants.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-container p-3"
              >
                <input
                  type="checkbox"
                  checked={payIds.includes(player.id)}
                  disabled={player.paid}
                  onChange={(event) =>
                    setPayIds((current) =>
                      event.target.checked
                        ? [...current, player.id]
                        : current.filter((id) => id !== player.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 text-sm">
                  {player.name || "Nome da inserire"}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(player.quota)}
                  disabled={player.paid}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setParticipants((current) =>
                      current.map((item) =>
                        item.id === player.id
                          ? {
                              ...item,
                              quota:
                                event.target.value === ""
                                  ? 0
                                  : Number.isFinite(value)
                                    ? Math.max(
                                        0,
                                        Math.round(value * 100) / 100,
                                      )
                                    : item.quota,
                            }
                          : item,
                      ),
                    );
                  }}
                  className="w-24 shrink-0"
                />
                {player.paid && <Badge tone="success">PAGATO</Badge>}
              </div>
            ))}
          </div>
                    <Field label="Metodo di pagamento">
            <Select
              value={payMethod}
              onChange={(event) =>
                setPayMethod(
                  event.target.value as "contanti" | "carta" | "misto",
                )
              }
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta / POS</option>
              <option value="misto">Misto</option>
            </Select>
          </Field>

          {payMethod === "misto" && (
            <Field label="Importo in contanti">
              <Input
                type="number"
                min="0"
                max={payTotal}
                step="0.01"
                value={payCash}
                onChange={(event) => setPayCash(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Carta: {eur(Math.max(0, payTotal - cashAmount))}
              </p>
            </Field>
          )}

          <Panel className="flex items-center justify-between p-3">
            <span className="label-caps text-muted-foreground">
              Totale selezionato
            </span>
            <span className="mono text-xl font-bold">
              {eur(payTotal)}
            </span>
          </Panel>
        </div>
      </Modal>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Annulla prenotazione"
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirm(false)}>
              Indietro
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                const n = series.cancel(
                  booking.id,
                  booking.seriesId ? scope : "this",
                );
                toast.success(
                  n > 1
                    ? `${n} blocchi annullati`
                    : "Prenotazione annullata, slot liberato",
                );
                setConfirm(false);
                onClose();
              }}
            >
              Conferma annullamento
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Lo slot {booking.start}–{booking.end} su {court?.name} tornerà
          disponibile e la mappa dei campi si aggiornerà al blocco successivo.
        </p>
      </Modal>
    </>
  );
}
