import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoVector,
  Illumination,
  MoonPhase,
  Observer,
  SearchMoonPhase,
  SearchRiseSet
} from "astronomy-engine";

export type ZodiacSign = {
  index: number;
  symbol: string;
  name: string;
  element: "Огонь" | "Земля" | "Воздух" | "Вода";
  modality: "Кардинальный" | "Фиксированный" | "Мутабельный";
  modernMoonTheme: string;
};

export const ZODIAC_SIGNS: ZodiacSign[] = [
  { index: 0, symbol: "♈", name: "Овен", element: "Огонь", modality: "Кардинальный", modernMoonTheme: "непосредственная реакция, импульс и потребность действовать" },
  { index: 1, symbol: "♉", name: "Телец", element: "Земля", modality: "Фиксированный", modernMoonTheme: "стабильность, телесный комфорт и потребность в надёжности" },
  { index: 2, symbol: "♊", name: "Близнецы", element: "Воздух", modality: "Мутабельный", modernMoonTheme: "обмен информацией, любопытство и эмоциональная подвижность" },
  { index: 3, symbol: "♋", name: "Рак", element: "Вода", modality: "Кардинальный", modernMoonTheme: "дом, привязанность, забота и эмоциональная безопасность" },
  { index: 4, symbol: "♌", name: "Лев", element: "Огонь", modality: "Фиксированный", modernMoonTheme: "самовыражение, признание, щедрость и творческий отклик" },
  { index: 5, symbol: "♍", name: "Дева", element: "Земля", modality: "Мутабельный", modernMoonTheme: "порядок, полезность, детали и практическая забота" },
  { index: 6, symbol: "♎", name: "Весы", element: "Воздух", modality: "Кардинальный", modernMoonTheme: "отношения, согласование интересов, эстетика и баланс" },
  { index: 7, symbol: "♏", name: "Скорпион", element: "Вода", modality: "Фиксированный", modernMoonTheme: "интенсивность, доверие, глубина и эмоциональная трансформация" },
  { index: 8, symbol: "♐", name: "Стрелец", element: "Огонь", modality: "Мутабельный", modernMoonTheme: "смысл, свобода, обучение и расширение горизонтов" },
  { index: 9, symbol: "♑", name: "Козерог", element: "Земля", modality: "Кардинальный", modernMoonTheme: "структура, ответственность, границы и долгосрочная устойчивость" },
  { index: 10, symbol: "♒", name: "Водолей", element: "Воздух", modality: "Фиксированный", modernMoonTheme: "независимость, сообщество, идеи и дистанция от привычного" },
  { index: 11, symbol: "♓", name: "Рыбы", element: "Вода", modality: "Мутабельный", modernMoonTheme: "чувствительность, воображение, сострадание и восстановление" }
];

export const TITHI_NAMES = [
  "Пратипада",
  "Двития",
  "Трития",
  "Чатуртхи",
  "Панчами",
  "Шаштхи",
  "Саптами",
  "Аштами",
  "Навами",
  "Дашами",
  "Экадаши",
  "Двадаши",
  "Трайодаши",
  "Чатурдаши",
  "Пурнима / Амавасья"
] as const;

const PHASES = [
  { icon: "🌑", name: "Новолуние" },
  { icon: "🌒", name: "Растущий серп" },
  { icon: "🌓", name: "Первая четверть" },
  { icon: "🌔", name: "Растущая Луна" },
  { icon: "🌕", name: "Полнолуние" },
  { icon: "🌖", name: "Убывающая Луна" },
  { icon: "🌗", name: "Последняя четверть" },
  { icon: "🌘", name: "Убывающий серп" }
] as const;

export type PlanetSnapshot = {
  key: string;
  name: string;
  symbol: string;
  longitude: number;
  degreeInSign: number;
  sign: ZodiacSign;
  retrograde: boolean | null;
};

export type MoonSnapshot = {
  at: Date;
  phaseAngle: number;
  phase: (typeof PHASES)[number];
  illumination: number;
  longitude: number;
  degreeInSign: number;
  sign: ZodiacSign;
  distanceKm: number;
  tithi: {
    absolute: number;
    numberInPaksha: number;
    name: string;
    paksha: "Шукла-пакша" | "Кришна-пакша";
    pakshaLabel: "растущая половина" | "убывающая половина";
  };
  nextNewMoon: Date | null;
  nextFullMoon: Date | null;
};

const PLANETS: Array<{ key: string; name: string; symbol: string; body: Body }> = [
  { key: "sun", name: "Солнце", symbol: "☉", body: Body.Sun },
  { key: "moon", name: "Луна", symbol: "☽", body: Body.Moon },
  { key: "mercury", name: "Меркурий", symbol: "☿", body: Body.Mercury },
  { key: "venus", name: "Венера", symbol: "♀", body: Body.Venus },
  { key: "mars", name: "Марс", symbol: "♂", body: Body.Mars },
  { key: "jupiter", name: "Юпитер", symbol: "♃", body: Body.Jupiter },
  { key: "saturn", name: "Сатурн", symbol: "♄", body: Body.Saturn },
  { key: "uranus", name: "Уран", symbol: "♅", body: Body.Uranus },
  { key: "neptune", name: "Нептун", symbol: "♆", body: Body.Neptune },
  { key: "pluto", name: "Плутон", symbol: "♇", body: Body.Pluto }
];

const KM_PER_AU = 149_597_870.7;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function signedDeltaDegrees(from: number, to: number) {
  let delta = normalizeDegrees(to) - normalizeDegrees(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function signForLongitude(longitude: number) {
  return ZODIAC_SIGNS[Math.floor(normalizeDegrees(longitude) / 30) % 12];
}

function degreeInSign(longitude: number) {
  return normalizeDegrees(longitude) % 30;
}

export function geocentricLongitude(body: Body, date: Date) {
  if (body === Body.Moon) return normalizeDegrees(EclipticGeoMoon(date).lon);
  return normalizeDegrees(Ecliptic(GeoVector(body, date, true)).elon);
}

function isRetrograde(body: Body, date: Date) {
  if (body === Body.Sun || body === Body.Moon) return null;
  const before = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  const after = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  return signedDeltaDegrees(geocentricLongitude(body, before), geocentricLongitude(body, after)) < 0;
}

export function getPlanetSnapshots(date = new Date()): PlanetSnapshot[] {
  return PLANETS.map((planet) => {
    const longitude = geocentricLongitude(planet.body, date);
    return {
      key: planet.key,
      name: planet.name,
      symbol: planet.symbol,
      longitude,
      degreeInSign: degreeInSign(longitude),
      sign: signForLongitude(longitude),
      retrograde: isRetrograde(planet.body, date)
    };
  });
}

function buildMoonSnapshot(date: Date, includeEvents: boolean): MoonSnapshot {
  const phaseAngle = normalizeDegrees(MoonPhase(date));
  const phaseIndex = Math.round((phaseAngle / 360) * 8) % 8;
  const moonPosition = EclipticGeoMoon(date);
  const moonIllumination = Illumination(Body.Moon, date);
  const longitude = normalizeDegrees(moonPosition.lon);

  const tithiIndex = Math.floor(phaseAngle / 12);
  const waxing = tithiIndex < 15;
  const numberInPaksha = (tithiIndex % 15) + 1;
  const tithiName = numberInPaksha === 15
    ? (waxing ? "Пурнима" : "Амавасья")
    : TITHI_NAMES[numberInPaksha - 1];

  const newMoon = includeEvents ? SearchMoonPhase(0, date, 35) : null;
  const fullMoon = includeEvents ? SearchMoonPhase(180, date, 35) : null;

  return {
    at: date,
    phaseAngle,
    phase: PHASES[phaseIndex],
    illumination: Math.round(moonIllumination.phase_fraction * 100),
    longitude,
    degreeInSign: degreeInSign(longitude),
    sign: signForLongitude(longitude),
    distanceKm: moonPosition.dist * KM_PER_AU,
    tithi: {
      absolute: tithiIndex + 1,
      numberInPaksha,
      name: tithiName,
      paksha: waxing ? "Шукла-пакша" : "Кришна-пакша",
      pakshaLabel: waxing ? "растущая половина" : "убывающая половина"
    },
    nextNewMoon: newMoon?.date ?? null,
    nextFullMoon: fullMoon?.date ?? null
  };
}


export function getMoonSnapshot(date = new Date()): MoonSnapshot {
  return buildMoonSnapshot(date, true);
}

export function getMoonCalendarSnapshot(date = new Date()): MoonSnapshot {
  return buildMoonSnapshot(date, false);
}

export function phaseTraditionText(snapshot: MoonSnapshot) {
  const angle = snapshot.phaseAngle;
  if (angle < 15 || angle >= 345) {
    return {
      title: "Новолуние",
      text: "В современной западной астрологической традиции новолуние обычно связывают с началом цикла, формированием намерения и периодом, когда новый процесс ещё не проявлен внешне."
    };
  }
  if (angle < 90) {
    return {
      title: "Растущая фаза",
      text: "Растущую Луну в современных лунно-астрологических практиках связывают с развитием уже начатого, накоплением импульса и движением к проявлению результата."
    };
  }
  if (angle < 165) {
    return {
      title: "Растущая Луна",
      text: "Период между первой четвертью и полнолунием обычно трактуют как фазу усиления, корректировки курса и доведения начатого до видимого результата."
    };
  }
  if (angle < 195) {
    return {
      title: "Полнолуние",
      text: "В западной астрологической символике полнолуние — оппозиция Солнца и Луны; его связывают с кульминацией цикла, проявлением результатов и напряжением между двумя полюсами."
    };
  }
  if (angle < 270) {
    return {
      title: "Убывающая Луна",
      text: "После полнолуния современная лунная астрология обычно связывает фазу с осмыслением результатов, распространением полученного опыта и постепенным отпусканием лишнего."
    };
  }
  return {
    title: "Завершение цикла",
    text: "Последнюю часть лунного цикла обычно трактуют как время завершения, сокращения нагрузки, освобождения от лишнего и подготовки к следующему новолунию."
  };
}


export type ObserverLocation = {
  latitude: number;
  longitude: number;
  label?: string;
};

export type RussianLunarDay = {
  number: number;
  start: Date;
  end: Date;
  previousNewMoon: Date;
  nextNewMoon: Date;
};

const DAY_MS = 86_400_000;

function lunationAround(date: Date) {
  const searchStart = new Date(date.getTime() - 35 * DAY_MS);
  let previous = SearchMoonPhase(0, searchStart, 40);
  if (!previous) return null;

  while (true) {
    const next = SearchMoonPhase(0, new Date(previous.date.getTime() + 60 * 60 * 1000), 35);
    if (!next) return null;
    if (next.date.getTime() > date.getTime()) {
      return { previous: previous.date, next: next.date };
    }
    previous = next;
  }
}

export function getRussianLunarDay(
  date: Date,
  location: ObserverLocation
): RussianLunarDay | null {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  if (location.latitude < -90 || location.latitude > 90) return null;
  if (location.longitude < -180 || location.longitude > 180) return null;

  const lunation = lunationAround(date);
  if (!lunation) return null;

  const observer = new Observer(location.latitude, location.longitude, 0);
  let number = 1;
  let start = lunation.previous;
  let cursor = new Date(lunation.previous.getTime() + 1000);
  let end = lunation.next;

  for (let guard = 0; guard < 35; guard += 1) {
    const rise = SearchRiseSet(Body.Moon, observer, +1, cursor, 4);
    if (!rise) break;

    const riseDate = rise.date;
    if (riseDate.getTime() >= lunation.next.getTime()) {
      end = lunation.next;
      break;
    }

    if (riseDate.getTime() > date.getTime()) {
      end = riseDate;
      break;
    }

    number += 1;
    start = riseDate;
    cursor = new Date(riseDate.getTime() + 60 * 1000);
  }

  return {
    number: Math.min(number, 30),
    start,
    end,
    previousNewMoon: lunation.previous,
    nextNewMoon: lunation.next
  };
}

export const ESOTERICA_SOURCES = [
  {
    group: "Астрономическая база",
    title: "Astronomy Engine",
    note: "Расчёт фаз, геоцентрических положений Луны и планет. Модели VSOP87/NOVAS, заявленная точность порядка одной угловой минуты.",
    url: "https://github.com/cosinekitty/astronomy"
  },
  {
    group: "Западная астрология",
    title: "Astrodienst Astro-Wiki — Moon",
    note: "Терминология фаз Луны и базовая западно-астрологическая символика Луны.",
    url: "https://www.astro.com/astrowiki/en/Moon"
  },
  {
    group: "Западная астрология",
    title: "Astrodienst Astro-Wiki — New Moon / Full Moon",
    note: "Трактовка новолуния и полнолуния как соединения и оппозиции Солнца и Луны.",
    url: "https://www.astro.com/astrowiki/en/New_Moon"
  },
  {
    group: "Традиционная астрология",
    title: "Skyscript — Void of Course Moon",
    note: "Историческая традиция и различия классического и современного определения Луны без курса.",
    url: "https://www.skyscript.co.uk/voc.html"
  },
  {
    group: "Индийская календарная традиция",
    title: "The Hindu Calendar — Sewell & Dikshit",
    note: "Титхи как 12° углового расстояния Луны от Солнца; 30 титхи составляют лунный месяц.",
    url: "https://ignca.gov.in/Asi_data/34958.pdf"
  },
  {
    group: "Русскоязычная лунная астрология",
    title: "Павел Глоба — «Лунная астрология»",
    note: "Книга школы содержит отдельные разделы о расчёте и характеристиках 1–30 лунных дней, Луне в знаках, лунных стоянках и других элементах системы.",
    url: "https://globaastra.by/lunnaya-astrologiya/"
  },
  {
    group: "Русскоязычная лунная астрология",
    title: "Авестийская школа П. Глобы — характеристика лунных дней",
    note: "Практическое описание школы: второй лунный день начинается с первого восхода Луны после новолуния и продолжается до следующего восхода.",
    url: "https://school-astrology.od.ua/harakteristika-lunnogo-dnja/"
  }
] as const;
