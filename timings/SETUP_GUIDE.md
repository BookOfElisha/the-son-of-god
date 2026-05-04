# Generating the Timing Files — Step by Step

You're about to run a **one-time** Python job on your computer that will produce 13 small JSON files. These tell the book reader exactly when each sentence is spoken in the audio. Once they're in `book/timings/`, the reader highlights sentences in sync with the narration.

---

## What you need

- A **Mac, Windows, or Linux** computer (a Mac is fine — even an older Intel one)
- About **2 hours of unattended runtime** (your computer can do other things; the script just needs to keep running in the background)
- ~10 GB of free disk space (the speech model is large)
- An internet connection (to download the model the first time)

You **do not** need a GPU — it'll just run on your CPU.

---

## Step 1 — Download the project to your computer

In the chat, ask Claude: **"Download the whole project as a zip."**

Save it somewhere easy to find — your Desktop is fine. Unzip it. You should see a folder containing `book/`, `assets/`, etc.

Open the **Terminal** app (Mac: `Cmd+Space`, type "Terminal"; Windows: search "PowerShell"). Then `cd` into the unzipped folder. Example:

```
cd ~/Desktop/Book-of-Elisha
```

If you can run `ls` and see `book/` in the output, you're in the right place.

---

## Step 2 — Install Python (skip if you already have it)

**Mac:** Python 3 comes preinstalled on modern macOS. Test it:
```
python3 --version
```
If you see `Python 3.10` or higher, you're good. If not, install from [python.org/downloads](https://www.python.org/downloads/).

**Windows:** Install from [python.org/downloads](https://www.python.org/downloads/). **Important:** during install, check the box that says "Add Python to PATH."

---

## Step 3 — Install the speech-recognition tools

In Terminal, run this **one command**. It will download the WhisperX library and its dependencies (~2 GB).

```
pip3 install whisperx
```

If `pip3` isn't found, try `pip` instead.

You also need **ffmpeg**, a free audio tool:

- **Mac:** Run `brew install ffmpeg` (if you don't have Homebrew, install from [brew.sh](https://brew.sh) first)
- **Windows:** Download from [ffmpeg.org/download.html](https://ffmpeg.org/download.html), unzip, and add the `bin` folder to your PATH. Or use `winget install ffmpeg`.

To test: run `ffmpeg -version` — you should see version info.

---

## Step 4 — Run the alignment script

From the project folder in Terminal, run:

```
python3 book/timings/align.py
```

**What you'll see:**
- First time only: it downloads the Whisper "large-v3" model (~3 GB). This takes 10–20 minutes.
- Then for each of the 13 spoken tracks, it prints:
  ```
  === section-1 ===
    transcribing 06_Section_1.mp3…
    aligning words…
    wrote book/timings/06_Section_1.json (78 sentences)
  ```
- Total runtime: **roughly 1.5–2 hours on CPU.** Faster if you have an Apple Silicon Mac or a GPU.

**You can leave Terminal running and use your computer for other things.** Don't close the Terminal window or put your laptop to sleep.

If something goes wrong with one section, the script will print a warning and move on. You can re-run only the failed ones later:
```
python3 book/timings/align.py section-3 section-7
```

---

## Step 5 — Drop the new JSON files into the project

When the script finishes, you'll have 13 new JSON files in `book/timings/` on your local computer:

```
01_The_Epigraph.json
02_The_Revelation.json
03_Authors_Testimony.json
04_Authors_Preface.json
05_Readers_Road_Map.json
06_Section_1.json
07_Section_2.json
08_Section_3.json
09_Section_4.json
10_Section_5.json
11_Section_6.json
12_Section_7.json
13_Section_8.json
14_Section_9.json
15_Continue_the_Journey.json
```

**Drag and drop all of them into the `book/timings/` folder in this chat's project file tree.** That's it — the reader picks them up automatically.

---

## Troubleshooting

- **`pip3: command not found`** → try `pip` instead
- **`ffmpeg not found`** → install it (step 3) and restart Terminal
- **`No CUDA device found`** → that's fine, it'll use CPU automatically
- **Script crashed mid-run** → no problem, just run it again with the section ids that didn't finish: `python3 book/timings/align.py section-X section-Y`
- **Out of memory** → try `python3 book/timings/align.py --model medium.en` (smaller model, slightly less accurate but still good)

If you hit any wall, paste the error into the chat and I'll help you through it.
