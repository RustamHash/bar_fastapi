"""Case-insensitive text search helpers."""

from sqlalchemy import ColumnElement
from sqlalchemy.orm.attributes import InstrumentedAttribute


def ilike_contains(column: InstrumentedAttribute, value: str) -> ColumnElement:
    return column.ilike(f"%{value}%")
