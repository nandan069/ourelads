import glob

html_files = glob.glob('*.html')
for file in html_files:
    with open(file, 'r') as f:
        content = f.read()
    
    if '<main id="main-content">' not in content:
        content = content.replace('<div id="site-header"></div>', '<div id="site-header"></div>\n  <main id="main-content">')
        content = content.replace('<div id="site-footer"></div>', '  </main>\n  <div id="site-footer"></div>')
        
        with open(file, 'w') as f:
            f.write(content)
