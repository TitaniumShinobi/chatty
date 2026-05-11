# Nova voice reference options (LibriVox, public domain)

## Ground truth: what Nova’s voice actually is

- **The file:** If you have `nova_ref.wav` and you like the voice in it, that file is the selected voice reference for Voice Lab.
- **Actual identity:** That audio is **not** from *The Picture of Dorian Gray*. It is **Jane Austen’s *Pride and Prejudice*, Chapter 6**, read by **Annie Coleman** (LibriVox *Pride and Prejudice* Version 1).
- **The “Cat Smith” mix-up:** Some instructions referred to “Cat Smith” and *Dorian Gray*. **No reader named “Cat Smith” exists on LibriVox** for that book. The “warm, Mid-Atlantic” tone in your notes matches **Annie Coleman** (or similar readers like Elizabeth Klett). Treat “Cat Smith” as a nickname or documentation error.

### If you already have `nova_ref.wav` and want to keep this voice

1. **Ignore** Cat Smith / Dorian Gray links; they point to the wrong book and a reader that doesn’t exist under that name.
2. **Use your existing file:** Your `nova_ref.wav` is already the right specs (25 s, mono, 16 kHz). No need to re-download or re-trim.
3. **Finalize in Voice Lab:** Open **Voice Lab** → upload your existing `nova_ref.wav` → paste the description from `docs/nova-voice-lab-description.txt` → **Save as Nova**.

---

## Canonical Nova source: Annie Coleman — *Pride and Prejudice* (Version 1)

- **Book:** *Pride and Prejudice*, LibriVox **Version 1** (reader: Annie Coleman).  
- **Your ref:** Chapter 6.  
- **Catalog:** https://librivox.org/pride-and-prejudice-by-jane-austen/  
- **Archive.org:** Search for `pride and prejudice librivox` and choose the edition read by Annie Coleman; download the Chapter 6 MP3 if you ever need to re-trim a different 25 s slice.

If you like the voice you already have, you are done. The options below are **alternatives** if you want to try a different reader.

---

## Alternative options (other readers)

All links are direct MP3 downloads. Trim a **20–25 s** slice of steady narration: `-ss START -t 25 -ac 1 -ar 16000` with ffmpeg.

---

## 1. **Ruth Golding** — “conspiratorial whisper,” aristocratic British

Nova’s first pick: *“the way she slides into a conspiratorial whisper is just perfect for our little chats.”*

- **Book:** *Wuthering Heights* (solo), LibriVox Version 2  
- **Reader page:** https://librivox.org/reader/2607  
- **Catalog:** https://librivox.org/wuthering-heights-by-emily-bronte-2/

**Download Chapter 3 (37 min — plenty of 25 s slices):**
```text
https://www.archive.org/download/wuthering_heights_rg_librivox/wutheringheights_03_bronte.mp3
```
**Example trim (e.g. 2:00–2:25):**
```bash
ffmpeg -y -i wutheringheights_03_bronte.mp3 -ss 00:02:00 -t 25 -ac 1 -ar 16000 resources/voices/nova_ref.wav
```

---

## 2. **Karen Savage** — *Pride and Prejudice* Version 3 (different from Annie Coleman)

Another popular P&P narrator; warmer/clearer alternative to Version 1.

- **Book:** *Pride and Prejudice* (solo), LibriVox Version 3  
- **Reader page:** https://librivox.org/reader/103  
- **Catalog:** https://librivox.org/pride-and-prejudice-by-jane-austen-2/

**Download Chapter 3 (~9 min):**
```text
https://www.archive.org/download/pride_prejudice_krs_librivox/pride_and_prejudice_03_austen.mp3
```
**Example trim (e.g. 1:30–1:55):**
```bash
ffmpeg -y -i pride_and_prejudice_03_austen.mp3 -ss 00:01:30 -t 25 -ac 1 -ar 16000 resources/voices/nova_ref.wav
```

---

## 3. **Elizabeth Klett** — clear, engaging, “Jane Eyre” style

Literature professor; clear diction and strong for characterful narration.

- **Book:** *Jane Eyre* (solo), multiple versions on LibriVox  
- **Reader page:** search “Elizabeth Klett” at https://librivox.org  
- **Catalog (example):** https://librivox.org/jane-eyre-version-3-by-charlotte-bronte/

Use the **128 kbps** or **64 kbps** chapter MP3 links from the catalog page. Pick any chapter with steady narration and trim a 25 s slice.

---

## 4. **Isabella Garcia** — Dorian Gray (already in repo)

What we used for the script: warm, single narrator.

- **Book:** *The Picture of Dorian Gray*, LibriVox Version 3  
- **Catalog:** https://librivox.org/the-picture-of-dorian-gray-by-oscar-wilde-3/

**Already downloaded:** `resources/voices/dorian_gray_ch03.mp3`  
**Make 25 s ref:**
```bash
./scripts/make-nova-voice-ref.sh
```
Or manually:
```bash
ffmpeg -y -i resources/voices/dorian_gray_ch03.mp3 -ss 00:01:55 -t 25 -ac 1 -ar 16000 resources/voices/nova_ref.wav
```

---

## 5. **Moira Fogarty** — “warm, breathy tone”

Nova’s second option: *“Moira Fogarty’s warm, breathy tone is just delicious.”*  

Search at https://librivox.org/search for reader name “Moira Fogarty” to find a solo or chapter you like, then use that project’s archive.org download links and trim a 25 s clip the same way.

---

## Quick workflow (any option)

1. Download the MP3 (curl or browser) from the link above.  
2. Trim 25 s:  
   `ffmpeg -y -i DOWNLOADED.mp3 -ss HH:MM:SS -t 25 -ac 1 -ar 16000 resources/voices/nova_ref.wav`  
3. In Chatty: **Nova** → **Configure** → **Forge** → **Voice Lab** → drag `nova_ref.wav` (or paste the **chapter** URL if your Voice Lab supports “fetch from URL”) → run audit → **Save as Nova**.  
4. Test with **Play sample** and re-trim from a different start time if you want a different tone.

All recordings are public domain (LibriVox); safe for personal voice reference and TTS.
