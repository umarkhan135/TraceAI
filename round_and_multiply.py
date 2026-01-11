def round_and_multiply(number):
    """
    Rounds a number and multiplies it by 2.

    Args:
        number: The number to round and multiply

    Returns:
        The rounded number multiplied by 2
    """
    return round(number) * 2


if __name__ == "__main__":
    # Example usage
    test_numbers = [3.7, 5.2, 8.9, 2.1, 7.5]

    print("Number -> Rounded * 2")
    print("-" * 25)
    for num in test_numbers:
        result = round_and_multiply(num)
        print(f"{num:5.1f} -> {result}")
