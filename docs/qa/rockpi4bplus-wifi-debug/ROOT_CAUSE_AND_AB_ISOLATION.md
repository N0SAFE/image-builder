# Rock Pi 4B+ — Root Cause and A/B Isolation Protocol

This document turns the current findings into a strict isolation workflow to identify the real failure domain without guesswork.

## Current root-cause statement (from collected evidence)

Most observed filesystem corruption errors were caused by **USB storage disconnects during write activity** on the host side (SD reader path), not by an immediately broken Armbian image.

Evidence already captured:

- Repeated kernel pattern: `USB disconnect` -> `JBD2/EXT4 write error` -> remount/recovery.
- Full raw image backup completed successfully.
- Backup image mounts read-only and contains valid boot artifacts (`boot.scr`, `Image`, `uInitrd`, `armbianEnv.txt`).

Implication: the image content is likely usable; instability is strongly associated with transport/power/media handling.

## Safety first (mandatory)

If you smell burned electronics or see localized heating:

1. Stop powering the board immediately.
2. Remove jumper wires.
3. Inspect SD reader, cable, and board around GPIO and power regulators.
4. Resume tests only with known-good power and minimal peripherals.

## Test assets naming

- **Card A**: original SD card used during failures.
- **Card B**: known-good replacement SD card.
- **Reader A**: current USB reader (Genesys `05e3:0761`).
- **Reader B**: known-good alternate reader.

## A/B isolation sequence

Run in order; change exactly one variable at a time.

### Phase 1 — Host write-path isolation

1. Card A + Reader A (host)
   - If disconnect/write errors appear again: mark combo unstable.
2. Card A + Reader B (host)
   - If errors disappear: Reader A/cable/port path is suspect.
3. Card B + Reader A (host)
   - If errors appear with Card B too: Reader A/cable/port path is likely root cause.
4. Card B + Reader B (host)
   - Expected clean baseline.

### Phase 2 — Board boot-source isolation

Use only a card proven stable in Phase 1.

1. Boot Rock Pi with **no GPIO short** and minimal peripherals.
2. If no boot, retry with known SPI bypass method (pins `23<->25`) only for controlled test.
3. If behavior changes only with bypass, suspect SPI/eMMC boot precedence path.
4. If still no stable boot and burn-smell context persists, suspect board hardware damage.

## Decision table

| Observation | Likely cause | Next action |
|---|---|---|
| Errors follow Reader A across multiple cards | Reader/cable/USB port instability | Replace reader/cable; avoid Reader A |
| Errors follow Card A across multiple readers | SD media damage/wear | Retire Card A; restore from backup to Card B |
| Host tests clean, board still fails without bypass | Boot-source order conflict (SPI/eMMC) | Use controlled bypass test; inspect SPI/eMMC state |
| Board only boots with `23<->25` short | SPI path influencing normal boot | Re-evaluate SPI contents/boot order strategy |
| Burn smell + random failures independent of card/reader | Board electrical fault likely | Stop power tests; perform hardware inspection/repair |

## Practical end-state criteria

You are done when all are true:

- One host flash path is stable (no disconnect/write errors).
- Board boots consistently from a known-good card on repeated cold boots.
- Wi-Fi debugging can proceed without storage transport errors polluting results.

## Notes tied to this repository workflow

- Keep SD mounted read-only on host when only collecting evidence.
- Use existing QA scripts in this folder for post-boot Wi-Fi diagnostics.
- Do not treat Wi-Fi logs as trustworthy until storage path is stable.