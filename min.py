def min_of_two(a, b):
    """Calculate the minimum of two numbers."""
    return a if a < b else b


if __name__ == "__main__":
    # Test the function
    num1 = 10
    num2 = 5
    result = min_of_two(num1, num2)
    print(f"The minimum of {num1} and {num2} is: {result}")

    # Test with negative numbers
    num3 = -3
    num4 = -7
    result2 = min_of_two(num3, num4)
    print(f"The minimum of {num3} and {num4} is: {result2}")
