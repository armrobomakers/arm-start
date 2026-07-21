# ARM Investor Indicator

Новый блок на главной странице ARM Start, который показывает сводную оценку состояния торговой системы ARM по шкале `-100 ... +100`.

## Назначение

Индикатор нужен, чтобы быстро понять:

- когда состояние кривой доходности ближе к `strong buy`;
- когда логичнее ждать;
- когда можно рассматривать фиксацию прибыли.

## Архитектура

`Myfxbook API` -> `server-side sync` -> `storage` -> `public API` -> `frontend widget`

Браузер не ходит в Myfxbook напрямую. Запросы идут только к собственным endpoint-ам:

- `GET /api/arm-indicator/current`
- `GET /api/arm-indicator/history?days=90`
- `GET /api/cron/arm-indicator`

## Источник данных

В production используется официальный Myfxbook API.

Основной поток:

1. `login`
2. `get-my-accounts`
3. поиск `account.id === 11020435`
4. `get-daily-gain`
5. нормализация и расчёт метрик
6. сохранение snapshot
7. `logout`

`get-data-daily` используется только как дополнительный cross-check.
`get-history` не используется как production-источник.

## Data Source

Поддерживаются режимы:

- `ARM_INDICATOR_DATA_SOURCE=fixture`
- `ARM_INDICATOR_DATA_SOURCE=myfxbook`

Для локальной разработки удобно оставлять fixture-режим. В production нужен `myfxbook`.

## Storage

Поддерживаются режимы:

- `ARM_INDICATOR_STORAGE=local`
- `ARM_INDICATOR_STORAGE=blob`

В local-режиме snapshot сохраняется в `.local-data/arm-indicator-state.json`.
В blob-режиме используется `@vercel/blob`.

## Growth Index

Из `dailyGain.value` строится кривая доходности.

Из неё вычисляются:

- текущая просадка `DD`
- доходность `30D`
- доходность `60D`
- доходность `90D`
- `daysSinceHigh`
- `momentum`

Из этих метрик формируется `score`.

## Score Engine

`score` не хардкодится.

Текущий fixture даёт значение около `-72`, что попадает в `strong_buy`.

## Zones

- `-100 ... -60` -> `strong_buy`
- `-59 ... -21` -> `buy`
- `-20 ... 20` -> `neutral`
- `21 ... 59` -> `profit`
- `60 ... 100` -> `strong_profit`

## Cron

Cron endpoint:

- `GET /api/cron/arm-indicator`

Защита:

- `Authorization: Bearer <CRON_SECRET>`

Расписание Vercel:

- `0 6 * * *`

## ENV

Используются переменные:

- `MYFXBOOK_EMAIL`
- `MYFXBOOK_PASSWORD`
- `MYFXBOOK_SYSTEM_ID`
- `MYFXBOOK_EXPECTED_ACCOUNT_NAME`
- `MYFXBOOK_HISTORY_START`
- `ARM_INDICATOR_DATA_SOURCE`
- `ARM_INDICATOR_STORAGE`
- `ARM_INDICATOR_TIMEZONE`
- `CRON_SECRET`

См. также `.env.example`.

## Testing

Локальные проверки:

```bash
npm run build
npm test
```

Тесты покрывают:

- fixture score и зону;
- парсинг дат Myfxbook;
- нормализацию `dailyGain`;
- обрезку незавершённого текущего дня.

## Troubleshooting

- Если индикатор показывает ошибку, проверьте, что API endpoint-ы доступны.
- Если production Myfxbook sync не запускается, проверьте `CRON_SECRET` и env-переменные.
- Если данные stale, значит последний успешный snapshot был сохранён ранее и cron не смог обновиться.
