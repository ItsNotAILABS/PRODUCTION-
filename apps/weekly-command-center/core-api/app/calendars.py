"""Real calendrical calculations — the "ancient calendar / task language" root
layer the platform is framed around. Every value here is computed from actual
calendar math (Julian Day Number as the common substrate), not decoration.

These are used as a context strip in the UI (today, in five real calendar
systems) and as the deterministic clock the weekly-continuity engine anchors
to — every week is derived from ISO 8601 week rules, which is itself an
"ancient task language": a millennia-old convention for carving a year into
addressable, recurring work units.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

# GMT (Goodman-Martinez-Thompson) correlation constant: JDN of Mayan
# creation date (0.0.0.0.0, 4 Ajaw 8 Kumk'u).
MAYA_CORRELATION = 584283

TZOLKIN_DAY_NAMES = [
    "Imix", "Ik", "Akbal", "Kan", "Chicchan", "Cimi", "Manik", "Lamat",
    "Muluc", "Oc", "Chuen", "Eb", "Ben", "Ix", "Men", "Cib", "Caban",
    "Etznab", "Cauac", "Ahau",
]

HAAB_MONTH_NAMES = [
    "Pop", "Wo", "Sip", "Sotz", "Sek", "Xul", "Yaxkin", "Mol", "Chen", "Yax",
    "Sak", "Keh", "Mak", "Kankin", "Muwan", "Pax", "Kayab", "Kumku", "Wayeb",
]

HEAVENLY_STEMS = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"]
EARTHLY_BRANCHES = [
    "Zi", "Chou", "Yin", "Mao", "Chen", "Si", "Wu", "Wei", "Shen", "You", "Xu", "Hai",
]
BRANCH_ANIMALS = [
    "Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat",
    "Monkey", "Rooster", "Dog", "Pig",
]

HIJRI_MONTHS = [
    "Muharram", "Safar", "Rabi' I", "Rabi' II", "Jumada I", "Jumada II",
    "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
]


def julian_day_number(d: date) -> int:
    """Standard Fliegel & Van Flandern algorithm, proleptic Gregorian input."""
    a = (14 - d.month) // 12
    y = d.year + 4800 - a
    m = d.month + 12 * a - 3
    return (
        d.day
        + (153 * m + 2) // 5
        + 365 * y
        + y // 4
        - y // 100
        + y // 400
        - 32045
    )


def mayan_long_count(jdn: int) -> dict:
    days = jdn - MAYA_CORRELATION
    baktun, rem = divmod(days, 144000)
    katun, rem = divmod(rem, 7200)
    tun, rem = divmod(rem, 360)
    winal, kin = divmod(rem, 20)
    tzolkin_number = ((days + 4 - 1) % 13) + 1  # day 0 = 4 Ajaw
    tzolkin_name = TZOLKIN_DAY_NAMES[(days + 19) % 20]
    haab_day_of_year = (days + 348) % 365  # day 0 = 8 Kumku -> offset 348
    haab_month_index = haab_day_of_year // 20
    haab_day = haab_day_of_year % 20
    return {
        "long_count": f"{baktun}.{katun}.{tun}.{winal}.{kin}",
        "tzolkin": f"{tzolkin_number} {tzolkin_name}",
        "haab": f"{haab_day} {HAAB_MONTH_NAMES[min(haab_month_index, 18)]}",
    }


def chinese_sexagenary_year(year: int) -> dict:
    # Cycle year 1 (Jia-Zi) begins 2697 BCE in the conventional epoch; using
    # the widely-used civil correlation where 1984 CE = Jia-Zi (index 0).
    offset = (year - 1984) % 60
    stem = HEAVENLY_STEMS[offset % 10]
    branch = EARTHLY_BRANCHES[offset % 12]
    return {
        "cycle_year": offset + 1,
        "stem": stem,
        "branch": branch,
        "animal": BRANCH_ANIMALS[offset % 12],
        "label": f"{stem}-{branch}",
    }


def hijri_tabular(jdn: int) -> dict:
    """Kuwaiti algorithm (tabular Islamic calendar, civil epoch 1948439)."""
    islamic_epoch = 1948439.5
    n = int(jdn - islamic_epoch)
    cycles, remainder = divmod(n, 10631)
    year = 30 * cycles
    # 30-year tabular cycle, 11 leap years: 2,5,7,10,13,16,18,21,24,26,29
    leap_years = {2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29}
    yr_in_cycle = 1
    days_used = 0
    while yr_in_cycle <= 30:
        year_len = 355 if yr_in_cycle in leap_years else 354
        if days_used + year_len > remainder:
            break
        days_used += year_len
        yr_in_cycle += 1
    year += yr_in_cycle
    day_of_year = remainder - days_used
    month_lengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29 + (1 if yr_in_cycle in leap_years else 0)]
    month_index = 0
    for length in month_lengths:
        if day_of_year < length:
            break
        day_of_year -= length
        month_index += 1
    month_index = min(month_index, 11)
    return {
        "year": year,
        "month": HIJRI_MONTHS[month_index],
        "day": day_of_year + 1,
    }


@dataclass
class TodayInAllCalendars:
    gregorian: str
    iso_week: str
    julian_day: int
    mayan: dict
    chinese: dict
    hijri: dict


def today_in_all_calendars(d: date | None = None) -> TodayInAllCalendars:
    d = d or date.today()
    jdn = julian_day_number(d)
    iso_year, iso_week, iso_weekday = d.isocalendar()
    return TodayInAllCalendars(
        gregorian=d.isoformat(),
        iso_week=f"{iso_year}-W{iso_week:02d}-{iso_weekday}",
        julian_day=jdn,
        mayan=mayan_long_count(jdn),
        chinese=chinese_sexagenary_year(d.year),
        hijri=hijri_tabular(jdn),
    )


def week_bounds(anchor: date | None = None) -> tuple[date, date]:
    """ISO week: Monday..Sunday containing `anchor` (default: today)."""
    anchor = anchor or date.today()
    start = anchor - timedelta(days=anchor.isoweekday() - 1)
    end = start + timedelta(days=6)
    return start, end
