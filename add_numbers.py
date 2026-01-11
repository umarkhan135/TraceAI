def add_numbers(a, b):
    """
    Add two numbers together and return the result.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    return a + b


def multiply_numbers(a, b):
    """
    Multiply two numbers together.

    Args:
        a: First number
        b: Second number

    Returns:
        The product of a and b
    """
    return a * b


def subtract_numbers(a, b):
    """
    Subtract b from a.

    Args:
        a: First number
        b: Second number

    Returns:
        The difference of a and b
    """
    return a - b


def divide_numbers(a, b):
    """
    Divide a by b with error handling.

    Args:
        a: First number (numerator)
        b: Second number (denominator)

    Returns:
        The quotient of a and b

    Raises:
        ValueError: If b is zero
    """
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


if __name__ == "__main__":
    # Test all functions
    num1 = 10
    num2 = 5

    # Addition
    result_add = add_numbers(num1, num2)
    print(f"Addition: {num1} + {num2} = {result_add}")

    # Multiplication
    result_mult = multiply_numbers(num1, num2)
    print(f"Multiplication: {num1} × {num2} = {result_mult}")

    # Subtraction
    result_sub = subtract_numbers(num1, num2)
    print(f"Subtraction: {num1} - {num2} = {result_sub}")

    # Division
    result_div = divide_numbers(num1, num2)
    print(f"Division: {num1} ÷ {num2} = {result_div}")

    # Test error handling
    try:
        divide_numbers(num1, 0)
    except ValueError as e:
        print(f"Error caught: {e}")
