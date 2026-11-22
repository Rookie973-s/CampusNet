try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    # Not using MySQL (e.g. still on SQLite/Postgres locally) — safe to skip.
    pass
