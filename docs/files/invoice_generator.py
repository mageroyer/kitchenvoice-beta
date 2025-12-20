#!/usr/bin/env python3
"""
KitchenCommand Invoice Test Suite Generator
Creates realistic Quebec food supplier invoices for database testing

Suppliers:
1. Norref (Seafood) - Colabor Division
2. Viandes Distrobec (Meat)  
3. Courchesne Larose (Vegetables/Produce)
4. Carrousel Emballage (Packaging/Supplies)
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime, timedelta
import os

# ===== COLOR PALETTES FOR EACH SUPPLIER =====
SUPPLIER_COLORS = {
    'norref': {
        'primary': colors.Color(0.0, 0.35, 0.60),    # Ocean blue
        'secondary': colors.Color(0.0, 0.55, 0.75),   # Light blue
        'accent': colors.Color(0.18, 0.55, 0.34)      # Green
    },
    'distrobec': {
        'primary': colors.Color(0.55, 0.09, 0.09),    # Dark red/maroon
        'secondary': colors.Color(0.75, 0.20, 0.20),  # Medium red
        'accent': colors.Color(0.25, 0.25, 0.25)      # Dark gray
    },
    'courchesne': {
        'primary': colors.Color(0.20, 0.45, 0.20),    # Forest green
        'secondary': colors.Color(0.30, 0.60, 0.30),  # Medium green
        'accent': colors.Color(0.55, 0.35, 0.10)      # Brown
    },
    'carrousel': {
        'primary': colors.Color(0.25, 0.25, 0.35),    # Dark blue-gray
        'secondary': colors.Color(0.40, 0.40, 0.50),  # Medium gray
        'accent': colors.Color(0.85, 0.55, 0.10)      # Orange
    }
}

# ===== SUPPLIER INFORMATION =====
SUPPLIERS = {
    'norref': {
        'name': 'Les Pêcheries Norref Québec Inc.',
        'tagline': 'Une division de Colabor',
        'address': '4900, rue Molson',
        'city': 'Montréal, QC H1Y 3J4',
        'phone': '514-906-0931',
        'fax': '514-906-0935',
        'website': 'norref.com',
        'gst': '845 291 567 RT0001',
        'qst': '1214 567 890 TQ0001',
        'terms': 'Net 14 jours / Net 14 Days'
    },
    'distrobec': {
        'name': 'Les Aliments Distrobec Inc.',
        'tagline': 'Viandes de qualité supérieure',
        'address': '9350, boul. Henri-Bourassa Est',
        'city': 'Montréal, QC H1E 2S4',
        'phone': '514-648-2600',
        'fax': '514-648-8822',
        'website': 'distrobec.com',
        'gst': '723 456 891 RT0001',
        'qst': '1198 234 567 TQ0001',
        'terms': 'Net 21 jours / Net 21 Days'
    },
    'courchesne': {
        'name': 'Courchesne Larose Ltée',
        'tagline': 'La qualité depuis 1918',
        'address': '9001, boul. des Sciences',
        'city': 'Anjou, QC H1J 1H5',
        'phone': '514-352-4001',
        'fax': '514-352-4191',
        'website': 'courchesnelarose.com',
        'gst': '891 234 567 RT0001',
        'qst': '1245 678 901 TQ0001',
        'terms': 'Net 14 jours / Net 14 Days'
    },
    'carrousel': {
        'name': 'Carrousel Emballage Inc.',
        'tagline': 'Solutions d\'emballage depuis 1971',
        'address': '8585, boul. Langelier',
        'city': 'Saint-Léonard, QC H1P 2C7',
        'phone': '514-327-6222',
        'fax': '514-327-6891',
        'website': 'carrousel.ca',
        'gst': '567 891 234 RT0001',
        'qst': '1167 890 123 TQ0001',
        'terms': 'Net 30 jours / Net 30 Days'
    }
}

# ===== CUSTOMER INFO =====
CUSTOMER = {
    'name': 'Bistro Le Gourmet Inc.',
    'attention': 'Chef Marc-André Tremblay',
    'address': '1234, rue Sainte-Catherine Est',
    'city': 'Montréal, QC H2L 2H5',
    'phone': '514-555-1234',
    'customer_no': 'MTL-458923'
}

# ===== PRODUCT CATALOGS =====

SEAFOOD_PRODUCTS = [
    # (item_code, description, pack, unit_price)
    ('SF-10234', 'SAUMON ATLANTIQUE FRAIS 10-12LB', '1/PC', 14.85),
    ('SF-10241', 'SAUMON ATLANTIQUE FILET S/P', 'KG', 22.50),
    ('SF-10312', 'TRUITE ARC-EN-CIEL PORTION 6OZ', '1/10LB', 45.75),
    ('SF-10425', 'CREVETTES 16/20 TIGRE CRUES', '2/5LB', 89.50),
    ('SF-10426', 'CREVETTES 21/25 TIGRE CUITES', '2/5LB', 78.25),
    ('SF-10512', 'HOMARD VIVANT 1.25LB', 'PC', 28.95),
    ('SF-10623', 'MOULES DE L\'IPE 2LB', '1/2LB', 8.45),
    ('SF-10731', 'PÉTONCLES U10 DRY PACK', '1/5LB', 125.00),
    ('SF-10745', 'PÉTONCLES 20/30 IQF', '2/5LB', 68.50),
    ('SF-10821', 'FILET MORUE FRAÎCHE', 'KG', 18.75),
    ('SF-10834', 'FILET AIGLEFIN FRAIS', 'KG', 19.50),
    ('SF-10912', 'THON ALBACORE LOIN AAA', 'KG', 38.50),
    ('SF-11023', 'CALMAR TUBE & TENTACULE', '2/2.5KG', 32.75),
    ('SF-11134', 'CRABE DORMEUR SECT.', '1/5LB', 42.50),
    ('SF-11245', 'HUÎTRES MALPEQUE #1', '100CT', 85.00),
]

MEAT_PRODUCTS = [
    # (item_code, description, pack, unit_price)
    ('VD-20145', 'BOEUF AAA FILET MIGNON 8OZ', '1/10LB', 185.00),
    ('VD-20156', 'BOEUF AAA CÔTE DE BOEUF', 'KG', 32.50),
    ('VD-20234', 'BOEUF AAA BAVETTE MARINÉE', '2/5KG', 89.75),
    ('VD-20312', 'BOEUF HACHÉ MI-MAIGRE', '2/5KG', 42.50),
    ('VD-20345', 'BOEUF AAA STRIPLOIN', 'KG', 28.75),
    ('VD-30123', 'VEAU ESCALOPE 4OZ', '1/5KG', 125.00),
    ('VD-30156', 'VEAU OSSO BUCO 2"', '1/10KG', 95.50),
    ('VD-30234', 'VEAU CÔTELETTE FRENCHED', '1/5KG', 145.00),
    ('VD-40123', 'PORC LONGE DÉSOSSÉE', 'KG', 12.85),
    ('VD-40234', 'PORC CÔTE LEVÉE BB', '1/20KG', 118.50),
    ('VD-40312', 'PORC BACON TRANCHÉ', '5KG', 45.75),
    ('VD-50123', 'AGNEAU CARRÉ FRENCHED', '1/PC', 68.50),
    ('VD-50234', 'AGNEAU GIGOT DÉSOSSÉ', 'KG', 24.75),
    ('VD-60123', 'CANARD MAGRET FRAIS', '1/PC', 18.95),
    ('VD-60234', 'CANARD CUISSE CONFITE', '4/12PC', 85.00),
    ('VD-70123', 'POULET POITRINE S/P S/O', '2/5KG', 52.50),
    ('VD-70234', 'POULET CUISSE DÉSOSSÉE', '2/5KG', 38.75),
]

PRODUCE_PRODUCTS = [
    # (item_code, description, pack, unit_price)
    ('CL-80123', 'TOMATE ITALIENNE CAISSE', '1/25LB', 28.50),
    ('CL-80134', 'TOMATE CERISE ROUGE', '12/DRY PT', 32.75),
    ('CL-80145', 'TOMATE GRAPE MIXTE', '12/DRY PT', 35.50),
    ('CL-80212', 'LAITUE ROMAINE 24CT', '1/24CT', 38.75),
    ('CL-80223', 'MESCLUN BIO', '4/2.5LB', 42.50),
    ('CL-80234', 'ÉPINARD BÉBÉ', '4/2.5LB', 38.25),
    ('CL-80312', 'CAROTTE NANTAISE', '1/50LB', 32.50),
    ('CL-80323', 'CAROTTE BÉBÉ PELÉE', '4/5LB', 28.75),
    ('CL-80412', 'OIGNON ESPAGNOL JUMBO', '1/50LB', 25.50),
    ('CL-80423', 'OIGNON ROUGE', '1/25LB', 22.75),
    ('CL-80434', 'ÉCHALOTE FRANÇAISE', '1/5KG', 45.00),
    ('CL-80512', 'POMME DE TERRE IDAHO', '1/50LB', 28.95),
    ('CL-80523', 'POMME DE TERRE GRELOT', '1/50LB', 35.50),
    ('CL-80612', 'POIVRON ROUGE', '1/25LB', 52.50),
    ('CL-80623', 'POIVRON JAUNE', '1/25LB', 55.75),
    ('CL-80634', 'POIVRON VERT', '1/25LB', 28.50),
    ('CL-80712', 'CHAMPIGNON BLANC TRANCHÉ', '4/5LB', 42.50),
    ('CL-80723', 'CHAMPIGNON CREMINI', '4/5LB', 48.75),
    ('CL-80734', 'CHAMPIGNON SHIITAKE', '1/5LB', 32.50),
    ('CL-80812', 'BROCOLI COURONNE', '14CT', 28.75),
    ('CL-80823', 'CHOU-FLEUR', '12CT', 32.50),
    ('CL-80912', 'COURGETTE VERTE', '1/22LB', 24.50),
    ('CL-80923', 'AUBERGINE ITALIENNE', '1/22LB', 28.75),
    ('CL-81012', 'AIL PELÉ ENTIER', '6/3LB', 42.50),
    ('CL-81023', 'GINGEMBRE FRAIS', '1/30LB', 65.00),
    ('CL-81112', 'HERBES FRAÎCHES MIXTES', '12CT', 28.50),
    ('CL-81123', 'BASILIC FRAIS', '12CT', 22.75),
    ('CL-81134', 'CORIANDRE FRAÎCHE', '30CT', 18.50),
]

PACKAGING_PRODUCTS = [
    # (item_code, description, pack, unit_price)
    ('CE-90123', 'CONTENANT ALUM. 2.25LB RECT', '1/500', 65.50),
    ('CE-90134', 'CONTENANT ALUM. 1LB ROND', '1/500', 52.75),
    ('CE-90145', 'COUVERCLE ALUM. 2.25LB', '1/500', 38.50),
    ('CE-90212', 'SAC SOUS-VIDE 8X12', '1/1000', 45.75),
    ('CE-90223', 'SAC SOUS-VIDE 10X14', '1/1000', 58.50),
    ('CE-90312', 'FILM ÉTIRABLE 18"', '4/RL', 85.00),
    ('CE-90323', 'PAPIER CIRÉ 12"', '6/RL', 72.50),
    ('CE-90412', 'BOÎTE PIZZA 12" KRAFT', '1/50', 42.50),
    ('CE-90423', 'BOÎTE PIZZA 16" KRAFT', '1/50', 55.75),
    ('CE-90512', 'CONTENANT CLAM 8X8 3COMP', '1/200', 68.50),
    ('CE-90523', 'CONTENANT CLAM 9X9 1COMP', '1/200', 52.75),
    ('CE-90612', 'BOL SOUPE 16OZ + COUV', '1/250', 45.50),
    ('CE-90623', 'BOL SOUPE 32OZ + COUV', '1/250', 58.75),
    ('CE-90712', 'USTENSILES COMBO HVY', '1/500', 72.50),
    ('CE-90723', 'SERVIETTE DÎNER 2PLY', '1/3000', 45.00),
    ('CE-90812', 'GANTS NITRILE M', '10/100', 85.50),
    ('CE-90823', 'GANTS NITRILE L', '10/100', 85.50),
    ('CE-90912', 'SAC POUBELLE 35X50 BLK', '1/100', 35.75),
    ('CE-91012', 'DÉGRAISSEUR CONCENTRÉ', '4/4L', 48.50),
    ('CE-91023', 'DÉSINFECTANT QUAT', '4/4L', 52.75),
]


def draw_header(c, width, height, supplier_key, invoice_num, invoice_date, po_num):
    """Draw the invoice header section"""
    supplier = SUPPLIERS[supplier_key]
    colors_scheme = SUPPLIER_COLORS[supplier_key]
    
    # Main header bar
    c.setFillColor(colors_scheme['primary'])
    c.rect(0, height - 90, width, 90, fill=1)
    
    # Company name and tagline
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(35, height - 40, supplier['name'])
    
    c.setFont("Helvetica-Oblique", 11)
    c.drawString(35, height - 58, supplier['tagline'])
    
    # Invoice label
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(width - 35, height - 40, "FACTURE")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 35, height - 55, "INVOICE")
    
    # Secondary bar with contact info
    c.setFillColor(colors_scheme['secondary'])
    c.rect(0, height - 118, width, 28, fill=1)
    
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 8)
    contact_line = f"{supplier['address']} | {supplier['city']} | Tél: {supplier['phone']} | {supplier['website']}"
    c.drawCentredString(width/2, height - 108, contact_line)
    
    # Invoice details box (right side)
    box_y = height - 200
    c.setFillColor(colors.Color(0.95, 0.95, 0.95))
    c.rect(400, box_y, 170, 75, fill=1)
    c.setStrokeColor(colors_scheme['primary'])
    c.setLineWidth(1)
    c.rect(400, box_y, 170, 75, stroke=1)
    
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 9)
    
    y = box_y + 60
    c.drawString(408, y, "No Facture / Invoice #:")
    c.setFont("Helvetica", 9)
    c.drawRightString(562, y, invoice_num)
    
    y -= 15
    c.setFont("Helvetica-Bold", 9)
    c.drawString(408, y, "Date:")
    c.setFont("Helvetica", 9)
    c.drawRightString(562, y, invoice_date)
    
    y -= 15
    c.setFont("Helvetica-Bold", 9)
    c.drawString(408, y, "No Client / Customer #:")
    c.setFont("Helvetica", 9)
    c.drawRightString(562, y, CUSTOMER['customer_no'])
    
    y -= 15
    c.setFont("Helvetica-Bold", 9)
    c.drawString(408, y, "No Commande / PO #:")
    c.setFont("Helvetica", 9)
    c.drawRightString(562, y, po_num)
    
    return height - 130


def draw_addresses(c, y_start, supplier_key):
    """Draw bill-to and ship-to addresses"""
    supplier = SUPPLIERS[supplier_key]
    colors_scheme = SUPPLIER_COLORS[supplier_key]
    
    # Bill To
    c.setFillColor(colors_scheme['primary'])
    c.setFont("Helvetica-Bold", 10)
    c.drawString(35, y_start, "FACTURER À / BILL TO:")
    
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    y = y_start - 15
    c.drawString(35, y, CUSTOMER['name'])
    y -= 12
    c.drawString(35, y, f"À l'att: {CUSTOMER['attention']}")
    y -= 12
    c.drawString(35, y, CUSTOMER['address'])
    y -= 12
    c.drawString(35, y, CUSTOMER['city'])
    
    # Ship To
    c.setFillColor(colors_scheme['primary'])
    c.setFont("Helvetica-Bold", 10)
    c.drawString(220, y_start, "LIVRER À / SHIP TO:")
    
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    y = y_start - 15
    c.drawString(220, y, CUSTOMER['name'])
    y -= 12
    c.drawString(220, y, CUSTOMER['address'])
    y -= 12
    c.drawString(220, y, CUSTOMER['city'])
    y -= 12
    c.drawString(220, y, f"Tél: {CUSTOMER['phone']}")
    
    return y_start - 70


def draw_line_items(c, y_start, width, items, colors_scheme):
    """Draw the line items table"""
    
    # Table header
    c.setFillColor(colors_scheme['primary'])
    c.rect(30, y_start, width - 60, 18, fill=1)
    
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8)
    
    # Column headers - adjusted positions
    c.drawString(35, y_start + 5, "Code")
    c.drawString(95, y_start + 5, "Description")
    c.drawString(320, y_start + 5, "Format")
    c.drawString(375, y_start + 5, "Qté")
    c.drawRightString(460, y_start + 5, "Prix Unit.")
    c.drawRightString(555, y_start + 5, "Montant")
    
    y = y_start - 5
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 8)
    
    subtotal = 0
    row_num = 0
    
    for item in items:
        code, desc, pack, qty, unit_price = item
        extended = qty * unit_price
        subtotal += extended
        
        # Alternate row shading
        if row_num % 2 == 0:
            c.setFillColor(colors.Color(0.97, 0.97, 0.97))
            c.rect(30, y - 4, width - 60, 14, fill=1)
        
        c.setFillColor(colors.black)
        c.drawString(35, y, code)
        
        # Truncate description if too long
        if len(desc) > 32:
            desc = desc[:30] + '..'
        c.drawString(95, y, desc)
        c.drawString(320, y, pack)
        c.drawCentredString(385, y, str(qty))
        c.drawRightString(460, y, f"${unit_price:,.2f}")
        c.drawRightString(555, y, f"${extended:,.2f}")
        
        y -= 14
        row_num += 1
    
    return y, subtotal


def draw_totals(c, y_start, width, subtotal, supplier_key, freight=35.00, fuel=12.50):
    """Draw the totals section"""
    supplier = SUPPLIERS[supplier_key]
    colors_scheme = SUPPLIER_COLORS[supplier_key]
    
    # Totals box
    box_height = 130
    c.setStrokeColor(colors_scheme['primary'])
    c.setLineWidth(1)
    c.rect(380, y_start - box_height, 185, box_height, stroke=1)
    
    y = y_start - 15
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.black)
    
    c.drawString(390, y, "Sous-total / Subtotal:")
    c.drawRightString(555, y, f"${subtotal:,.2f}")
    
    y -= 14
    c.drawString(390, y, "Transport / Freight:")
    c.drawRightString(555, y, f"${freight:,.2f}")
    
    y -= 14
    c.drawString(390, y, "Surcharge carburant / Fuel:")
    c.drawRightString(555, y, f"${fuel:,.2f}")
    
    taxable = subtotal + freight + fuel
    
    y -= 14
    gst = taxable * 0.05
    c.drawString(390, y, "TPS/GST (5%):")
    c.drawRightString(555, y, f"${gst:,.2f}")
    
    y -= 14
    qst = taxable * 0.09975
    c.drawString(390, y, "TVQ/QST (9.975%):")
    c.drawRightString(555, y, f"${qst:,.2f}")
    
    y -= 20
    c.setLineWidth(1.5)
    c.line(385, y + 10, 560, y + 10)
    
    total = taxable + gst + qst
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors_scheme['primary'])
    c.drawString(390, y, "TOTAL:")
    c.drawRightString(555, y, f"${total:,.2f}")
    
    return y - 20, total


def draw_footer(c, y_start, width, height, supplier_key):
    """Draw footer with payment terms and tax numbers"""
    supplier = SUPPLIERS[supplier_key]
    colors_scheme = SUPPLIER_COLORS[supplier_key]
    
    # Payment terms box
    c.setFillColor(colors.Color(0.95, 0.95, 0.95))
    c.rect(30, y_start - 55, 320, 55, fill=1)
    
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y_start - 15, "CONDITIONS / TERMS:")
    
    c.setFont("Helvetica", 9)
    c.drawString(40, y_start - 30, supplier['terms'])
    c.drawString(40, y_start - 45, "Veuillez référer au numéro de facture / Please reference invoice #")
    
    # Tax registration numbers
    c.setFont("Helvetica", 8)
    c.drawString(380, y_start - 15, f"TPS/GST: {supplier['gst']}")
    c.drawString(380, y_start - 30, f"TVQ/QST: {supplier['qst']}")
    
    # Bottom bar
    c.setFillColor(colors_scheme['primary'])
    c.rect(0, 25, width, 25, fill=1)
    
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 9)
    c.drawCentredString(width/2, 35, "Merci de votre confiance! | Thank you for your business!")
    
    # Page number
    c.setFillColor(colors.gray)
    c.setFont("Helvetica", 7)
    c.drawRightString(width - 30, 12, "Page 1 de 1")


def generate_invoice(supplier_key, products_list, invoice_num, po_num, output_dir, selected_items=None):
    """Generate a single invoice"""
    width, height = letter
    supplier = SUPPLIERS[supplier_key]
    colors_scheme = SUPPLIER_COLORS[supplier_key]
    
    filename = os.path.join(output_dir, f"{supplier_key.upper()}_INV_{invoice_num}.pdf")
    c = canvas.Canvas(filename, pagesize=letter)
    
    invoice_date = datetime.now().strftime("%d/%m/%Y")
    
    # Draw header
    y = draw_header(c, width, height, supplier_key, invoice_num, invoice_date, po_num)
    
    # Draw addresses
    y = draw_addresses(c, y - 15, supplier_key)
    
    # Select items if not provided
    if selected_items is None:
        import random
        num_items = random.randint(8, 15)
        selected_items = []
        for product in random.sample(products_list, min(num_items, len(products_list))):
            code, desc, pack, unit_price = product
            qty = random.randint(1, 5)
            selected_items.append((code, desc, pack, qty, unit_price))
    
    # Draw line items
    y, subtotal = draw_line_items(c, y - 25, width, selected_items, colors_scheme)
    
    # Draw totals
    freight = round(25 + (subtotal * 0.02), 2)  # ~2% freight
    fuel = round(8 + (subtotal * 0.01), 2)      # ~1% fuel
    y, total = draw_totals(c, y - 20, width, subtotal, supplier_key, freight, fuel)
    
    # Draw footer
    draw_footer(c, y - 20, width, height, supplier_key)
    
    c.save()
    return filename, total


def main():
    """Generate all test invoices"""
    output_dir = "/home/claude/invoices"
    os.makedirs(output_dir, exist_ok=True)
    
    print("=" * 60)
    print("KitchenCommand Invoice Test Suite Generator")
    print("=" * 60)
    print()
    
    invoices_generated = []
    
    # Generate Seafood Invoice (Norref)
    print("Generating NORREF (Seafood) invoice...")
    seafood_items = [
        ('SF-10234', 'SAUMON ATLANTIQUE FRAIS 10-12LB', '1/PC', 3, 14.85),
        ('SF-10241', 'SAUMON ATLANTIQUE FILET S/P', 'KG', 8, 22.50),
        ('SF-10425', 'CREVETTES 16/20 TIGRE CRUES', '2/5LB', 4, 89.50),
        ('SF-10426', 'CREVETTES 21/25 TIGRE CUITES', '2/5LB', 3, 78.25),
        ('SF-10512', 'HOMARD VIVANT 1.25LB', 'PC', 12, 28.95),
        ('SF-10623', 'MOULES DE L\'IPE 2LB', '1/2LB', 20, 8.45),
        ('SF-10731', 'PÉTONCLES U10 DRY PACK', '1/5LB', 2, 125.00),
        ('SF-10821', 'FILET MORUE FRAÎCHE', 'KG', 5, 18.75),
        ('SF-10912', 'THON ALBACORE LOIN AAA', 'KG', 4, 38.50),
        ('SF-11245', 'HUÎTRES MALPEQUE #1', '100CT', 2, 85.00),
    ]
    filename, total = generate_invoice('norref', SEAFOOD_PRODUCTS, 'NRF-78234', 'PO-2025-1247', output_dir, seafood_items)
    invoices_generated.append(('Norref (Seafood)', filename, total))
    print(f"   ✓ Created: {filename}")
    print(f"   Total: ${total:,.2f}")
    print()
    
    # Generate Meat Invoice (Distrobec)
    print("Generating DISTROBEC (Meat) invoice...")
    meat_items = [
        ('VD-20145', 'BOEUF AAA FILET MIGNON 8OZ', '1/10LB', 2, 185.00),
        ('VD-20156', 'BOEUF AAA CÔTE DE BOEUF', 'KG', 15, 32.50),
        ('VD-20234', 'BOEUF AAA BAVETTE MARINÉE', '2/5KG', 3, 89.75),
        ('VD-20312', 'BOEUF HACHÉ MI-MAIGRE', '2/5KG', 5, 42.50),
        ('VD-30123', 'VEAU ESCALOPE 4OZ', '1/5KG', 2, 125.00),
        ('VD-30156', 'VEAU OSSO BUCO 2"', '1/10KG', 1, 95.50),
        ('VD-40123', 'PORC LONGE DÉSOSSÉE', 'KG', 10, 12.85),
        ('VD-40234', 'PORC CÔTE LEVÉE BB', '1/20KG', 2, 118.50),
        ('VD-50123', 'AGNEAU CARRÉ FRENCHED', '1/PC', 6, 68.50),
        ('VD-60123', 'CANARD MAGRET FRAIS', '1/PC', 10, 18.95),
        ('VD-70123', 'POULET POITRINE S/P S/O', '2/5KG', 4, 52.50),
    ]
    filename, total = generate_invoice('distrobec', MEAT_PRODUCTS, 'DST-45612', 'PO-2025-1248', output_dir, meat_items)
    invoices_generated.append(('Distrobec (Meat)', filename, total))
    print(f"   ✓ Created: {filename}")
    print(f"   Total: ${total:,.2f}")
    print()
    
    # Generate Produce Invoice (Courchesne Larose)
    print("Generating COURCHESNE LAROSE (Produce) invoice...")
    produce_items = [
        ('CL-80123', 'TOMATE ITALIENNE CAISSE', '1/25LB', 4, 28.50),
        ('CL-80134', 'TOMATE CERISE ROUGE', '12/DRY PT', 2, 32.75),
        ('CL-80212', 'LAITUE ROMAINE 24CT', '1/24CT', 3, 38.75),
        ('CL-80223', 'MESCLUN BIO', '4/2.5LB', 2, 42.50),
        ('CL-80234', 'ÉPINARD BÉBÉ', '4/2.5LB', 2, 38.25),
        ('CL-80312', 'CAROTTE NANTAISE', '1/50LB', 2, 32.50),
        ('CL-80412', 'OIGNON ESPAGNOL JUMBO', '1/50LB', 3, 25.50),
        ('CL-80434', 'ÉCHALOTE FRANÇAISE', '1/5KG', 2, 45.00),
        ('CL-80512', 'POMME DE TERRE IDAHO', '1/50LB', 4, 28.95),
        ('CL-80612', 'POIVRON ROUGE', '1/25LB', 3, 52.50),
        ('CL-80634', 'POIVRON VERT', '1/25LB', 2, 28.50),
        ('CL-80712', 'CHAMPIGNON BLANC TRANCHÉ', '4/5LB', 3, 42.50),
        ('CL-80812', 'BROCOLI COURONNE', '14CT', 2, 28.75),
        ('CL-81012', 'AIL PELÉ ENTIER', '6/3LB', 2, 42.50),
        ('CL-81123', 'BASILIC FRAIS', '12CT', 3, 22.75),
    ]
    filename, total = generate_invoice('courchesne', PRODUCE_PRODUCTS, 'CLR-92341', 'PO-2025-1249', output_dir, produce_items)
    invoices_generated.append(('Courchesne Larose (Produce)', filename, total))
    print(f"   ✓ Created: {filename}")
    print(f"   Total: ${total:,.2f}")
    print()
    
    # Generate Packaging Invoice (Carrousel)
    print("Generating CARROUSEL (Packaging) invoice...")
    packaging_items = [
        ('CE-90123', 'CONTENANT ALUM. 2.25LB RECT', '1/500', 2, 65.50),
        ('CE-90134', 'CONTENANT ALUM. 1LB ROND', '1/500', 1, 52.75),
        ('CE-90145', 'COUVERCLE ALUM. 2.25LB', '1/500', 2, 38.50),
        ('CE-90212', 'SAC SOUS-VIDE 8X12', '1/1000', 1, 45.75),
        ('CE-90312', 'FILM ÉTIRABLE 18"', '4/RL', 3, 85.00),
        ('CE-90323', 'PAPIER CIRÉ 12"', '6/RL', 2, 72.50),
        ('CE-90512', 'CONTENANT CLAM 8X8 3COMP', '1/200', 2, 68.50),
        ('CE-90612', 'BOL SOUPE 16OZ + COUV', '1/250', 3, 45.50),
        ('CE-90714', 'USTENSILES COMBO HVY', '1/500', 1, 72.50),
        ('CE-90723', 'SERVIETTE DÎNER 2PLY', '1/3000', 2, 45.00),
        ('CE-90812', 'GANTS NITRILE M', '10/100', 1, 85.50),
        ('CE-90912', 'SAC POUBELLE 35X50 BLK', '1/100', 3, 35.75),
    ]
    filename, total = generate_invoice('carrousel', PACKAGING_PRODUCTS, 'CRS-12789', 'PO-2025-1250', output_dir, packaging_items)
    invoices_generated.append(('Carrousel (Packaging)', filename, total))
    print(f"   ✓ Created: {filename}")
    print(f"   Total: ${total:,.2f}")
    print()
    
    # Summary
    print("=" * 60)
    print("SUMMARY - Invoices Generated")
    print("=" * 60)
    grand_total = 0
    for name, filepath, total in invoices_generated:
        print(f"  {name:30} ${total:>10,.2f}")
        grand_total += total
    print("-" * 50)
    print(f"  {'GRAND TOTAL':30} ${grand_total:>10,.2f}")
    print()
    print(f"All invoices saved to: {output_dir}")
    print()
    
    return output_dir, invoices_generated


if __name__ == "__main__":
    main()
