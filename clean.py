import re

def clean(string):
    removelist = ""  # Add any characters you'd like to keep
    # Remove HTML tags
    result = re.sub(r'<[^>]+>', '', string)
    # Remove URLs
    result = re.sub(r'https?://\S+', '', result)
    # Remove non-alphanumeric characters (except for those in the removelist)
    result = re.sub(r'[^a-zA-Z0-9' + removelist + r'\s\n]', ' ', result)
    # Remove extra spaces
    result = re.sub(r'[ \t]+', ' ', result).strip()
    # Convert to lowercase
    result = result.lower()
    return result

def clean_text(path):
    with open(path, 'r', encoding='utf-8') as file:
        text = file.read()
    cleaned_text = clean(text)
    with open(path, 'w', encoding='utf-8') as file:
        file.write(cleaned_text)

if __name__ == "__main__":
    clean_text("text/data.txt")
