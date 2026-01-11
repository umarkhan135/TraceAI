"""
Simple greeter module for testing TraceAI.
"""

def greet(name: str) -> str:
    """
    Greet a person by name.

    Args:
        name: The person's name

    Returns:
        A friendly greeting
    """
    return f"Hello, {name}! Welcome to TraceAI."


def farewell(name: str) -> str:
    """
    Say goodbye to a person.

    Args:
        name: The person's name

    Returns:
        A farewell message
    """
    return f"Goodbye, {name}! Thanks for using TraceAI."


if __name__ == "__main__":
    print(greet("Developer"))
    print(farewell("Developer"))
