def is_even(n: int) -> bool:
    return n % 2 == 0


def is_odd(n: int) -> bool:
    return n % 2 != 0


def check_even_odd(n: int) -> str:
    if is_even(n):
        return "even"
    return "odd"
