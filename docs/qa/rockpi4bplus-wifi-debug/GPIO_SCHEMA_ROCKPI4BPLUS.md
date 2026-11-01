# ROCK Pi 4B+ — Complete 40-pin GPIO schema (official color mapping)

You were right: the previous version mixed **function categories** with **pin colors**.  
This version follows the Radxa ROCK 4 official GPIO table color logic.

## Official pin color legend (from Radxa table)

- 🟥 **Red pin number** = +5V rail
- 🟨 **Yellow pin number** = +3.3V rail
- ⬛ **Black pin number** = GND
- 🟩 **Green pin number** = standard signal/IO pin
- 🟦 **Blue pin number** = special I2C2 pair (pins 27/28 in official table)
- 🟧 **Orange function text** = default function label (not pin color)

## Complete 40-pin layout (top view)

Odd pins are on the **left**, even pins on the **right**.

| Left (odd) | Right (even) |
|---|---|
| 1 🟨 +3.3V | 2 🟥 +5V |
| 3 🟩 GPIO2_A7 / I2C7_SDA | 4 🟥 +5V |
| 5 🟩 GPIO2_B0 / I2C7_SCL | 6 ⬛ GND |
| 7 🟩 GPIO2_B3 / SPI2_CLK | 8 🟩 GPIO4_C4 / 🟧UART2_TXD |
| 9 ⬛ GND | 10 🟩 GPIO4_C3 / 🟧UART2_RXD |
| 11 🟩 GPIO4_C2 / PWM0 | 12 🟩 GPIO4_A3 / I2S1_SCLK |
| 13 🟩 GPIO4_C6 / PWM1 | 14 ⬛ GND |
| 15 🟩 GPIO4_C5 / SPDIF_TX | 16 🟩 GPIO4_D2 |
| 17 🟨 +3.3V | 18 🟩 GPIO4_D4 |
| 19 🟩 GPIO1_B0 / 🟧SPI1_TXD / UART4_TXD | 20 ⬛ GND |
| 21 🟩 GPIO1_A7 / 🟧SPI1_RXD / UART4_RXD | 22 🟩 GPIO4_D5 |
| 23 🟩 GPIO1_B1 / 🟧SPI1_CLK | 24 🟩 GPIO1_B2 / 🟧SPI1_CSn |
| 25 ⬛ GND | 26 🟩 ADC_IN0 (1.8V domain) |
| 27 🟦 GPIO2_A0 / I2C2_SDA | 28 🟦 GPIO2_A1 / I2C2_CLK |
| 29 🟩 GPIO2_B2 / SPI2_TXD / I2C6_SCL | 30 ⬛ GND |
| 31 🟩 GPIO2_B1 / SPI2_RXD / I2C6_SDA | 32 🟩 GPIO3_C0 / SPDIF_TX / UART3_CTSn |
| 33 🟩 GPIO2_B4 / SPI2_CSn | 34 ⬛ GND |
| 35 🟩 GPIO4_A5 / I2S1_LRCK_TX | 36 🟩 GPIO4_A4 / I2S1_LRCK_RX |
| 37 🟩 GPIO4_D6 | 38 🟩 GPIO4_A6 / I2S1_SDI |
| 39 ⬛ GND | 40 🟩 GPIO4_A7 / I2S1_SDO |

## Complete pin-by-pin table

| Pin | Pin color | GPIO / rail | Functions | Linux GPIO # |
|---:|:---:|---|---|---:|
| 1 | 🟨 | +3.3V | Power | — |
| 2 | 🟥 | +5V | Power | — |
| 3 | 🟩 | GPIO2_A7 | I2C7_SDA | 71 |
| 4 | 🟥 | +5V | Power | — |
| 5 | 🟩 | GPIO2_B0 | I2C7_SCL | 72 |
| 6 | ⬛ | GND | Ground | — |
| 7 | 🟩 | GPIO2_B3 | SPI2_CLK | 75 |
| 8 | 🟩 | GPIO4_C4 | 🟧UART2_TXD | 148 |
| 9 | ⬛ | GND | Ground | — |
| 10 | 🟩 | GPIO4_C3 | 🟧UART2_RXD | 147 |
| 11 | 🟩 | GPIO4_C2 | PWM0 | 146 |
| 12 | 🟩 | GPIO4_A3 | I2S1_SCLK | 131 |
| 13 | 🟩 | GPIO4_C6 | PWM1 | 150 |
| 14 | ⬛ | GND | Ground | — |
| 15 | 🟩 | GPIO4_C5 | SPDIF_TX | 149 |
| 16 | 🟩 | GPIO4_D2 | GPIO | 154 |
| 17 | 🟨 | +3.3V | Power | — |
| 18 | 🟩 | GPIO4_D4 | GPIO | 156 |
| 19 | 🟩 | GPIO1_B0 | 🟧SPI1_TXD, UART4_TXD | 40 |
| 20 | ⬛ | GND | Ground | — |
| 21 | 🟩 | GPIO1_A7 | 🟧SPI1_RXD, UART4_RXD | 39 |
| 22 | 🟩 | GPIO4_D5 | GPIO | 157 |
| 23 | 🟩 | GPIO1_B1 | 🟧SPI1_CLK | 41 |
| 24 | 🟩 | GPIO1_B2 | 🟧SPI1_CSn | 42 |
| 25 | ⬛ | GND | Ground | — |
| 26 | 🟩 | ADC_IN0 | Analog input (1.8V domain) | — |
| 27 | 🟦 | GPIO2_A0 | I2C2_SDA | 64 |
| 28 | 🟦 | GPIO2_A1 | I2C2_CLK | 65 |
| 29 | 🟩 | GPIO2_B2 | SPI2_TXD, I2C6_SCL | 74 |
| 30 | ⬛ | GND | Ground | — |
| 31 | 🟩 | GPIO2_B1 | SPI2_RXD, I2C6_SDA | 73 |
| 32 | 🟩 | GPIO3_C0 | SPDIF_TX, UART3_CTSn | 112 |
| 33 | 🟩 | GPIO2_B4 | SPI2_CSn | 76 |
| 34 | ⬛ | GND | Ground | — |
| 35 | 🟩 | GPIO4_A5 | I2S1_LRCK_TX | 133 |
| 36 | 🟩 | GPIO4_A4 | I2S1_LRCK_RX | 132 |
| 37 | 🟩 | GPIO4_D6 | GPIO | 158 |
| 38 | 🟩 | GPIO4_A6 | I2S1_SDI | 134 |
| 39 | ⬛ | GND | Ground | — |
| 40 | 🟩 | GPIO4_A7 | I2S1_SDO | 135 |

## Critical notes

- **Do not short any power pin** (🟥/🟨) to GND (⬛).
- **Pin 26 (ADC_IN0)** is analog and lower-voltage domain.
- Pins **19/21/23/24** share SPI-related signals (and may be impacted by board SPI usage).
- UART2 on **pins 8/10** is commonly used for boot/Linux serial console.

## Recovery jumper reminder

- Common troubleshooting jumper: **pin 23 ↔ pin 25 (GND)**.
- This is SPI-path-related behavior; it is **not** a generic “disable eMMC” switch.
