# SmartCookBook User Guide

**Version 2.0** | **Last Updated: January 2026**

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Invoice Management](#2-invoice-management)
3. [Inventory Management](#3-inventory-management)
4. [Recipe Management](#4-recipe-management)
5. [Task Management](#5-task-management)
6. [Purchase Orders](#6-purchase-orders)
7. [Control Panel & Settings](#7-control-panel--settings)
8. [Tips & Best Practices](#8-tips--best-practices)

---

## 1. Getting Started

### 1.1 Creating Your Account

1. Navigate to the SmartCookBook app at **https://smartcookbook-2afe2.web.app**
2. Click **"Register"** on the landing page
3. Fill in your details:
   - Email address
   - Password (minimum 8 characters)
   - Business name
4. Accept the Terms of Service and Privacy Policy
5. Click **"Create Account"**

> **Screenshot placeholder:** *Registration form*

### 1.2 Logging In

1. Go to the login page
2. Enter your email and password
3. Click **"Sign In"**

For team members, your administrator will provide login credentials.

> **Screenshot placeholder:** *Login page*

### 1.3 Dashboard Overview

After logging in, you'll see the main navigation menu with these sections:

| Menu Item | Description |
|-----------|-------------|
| **Recipes** | View and manage all recipes |
| **Inventory** | Track stock levels and costs |
| **Invoices** | Upload and process supplier invoices |
| **Tasks** | Assign and track production tasks |
| **Orders** | Manage purchase orders |
| **Settings** | Configure your account and preferences |

> **Screenshot placeholder:** *Main dashboard with menu*

---

## 2. Invoice Management

SmartCookBook uses AI-powered Vision parsing to automatically extract data from your supplier invoices.

### 2.1 Uploading an Invoice

1. Click **"Invoices"** in the menu
2. Click **"Upload Invoice"**
3. Select a PDF file from your computer (or drag and drop)
4. The system will automatically process the invoice using Vision AI

> **Screenshot placeholder:** *Invoice upload page*

### 2.2 Understanding the Vision Parser

The Vision AI automatically extracts:
- **Vendor name** and contact information
- **Invoice number** and date
- **Line items** with quantities, units, and prices
- **Tax amounts** (TPS/TVQ for Quebec)
- **Totals**

Processing typically takes 5-15 seconds depending on invoice complexity.

> **Screenshot placeholder:** *Vision parsing in progress*

### 2.3 Reviewing Parsed Lines

After parsing, you'll see all extracted line items:

| Column | Description |
|--------|-------------|
| **Description** | Product name from invoice |
| **Quantity** | Number of units ordered |
| **Unit** | Unit of measure (ea, kg, lb, case, etc.) |
| **Unit Price** | Price per unit |
| **Total** | Line total |
| **Status** | Validation status (checkmark = valid) |

**To edit a line:**
1. Click on any line item
2. Modify the values in the edit modal
3. Click **"Save"**

> **Screenshot placeholder:** *Invoice line items table*

### 2.4 Saving to Inventory

Once you've reviewed the parsed data:

1. Verify the **vendor** is correctly identified
2. Check that line items have valid quantities and prices
3. Click **"Save to Inventory"**

The system will:
- Create new inventory items for products not yet in your system
- Update prices for existing items
- Record the purchase for cost tracking

> **Screenshot placeholder:** *Save to inventory confirmation*

### 2.5 Invoice Types

SmartCookBook automatically detects invoice types:

| Type | Examples | Special Handling |
|------|----------|------------------|
| **Food Supply** | Produce, meat, dairy | Tracks price per kg/lb |
| **Packaging** | Containers, bags, labels | Tracks units per case |
| **Utilities** | Electric, gas, water | Tracks usage (kWh, m³) |
| **Services** | Repairs, cleaning | Tracks hourly rates |

---

## 3. Inventory Management

### 3.1 Viewing Your Inventory

1. Click **"Inventory"** in the menu
2. Browse items in the dashboard

**View modes:**
- **By Item** - Alphabetical list of all items
- **By Vendor** - Grouped by supplier
- **By Category** - Grouped by food category
- **In-House** - Items produced internally

> **Screenshot placeholder:** *Inventory dashboard*

### 3.2 Understanding Stock Display

Each inventory item shows:

```
PRODUCT NAME                    2 × 1/50LB = 100 pc | $1.43/kg  ▓▓▓▓▓▓▓░░░
```

| Element | Meaning |
|---------|---------|
| **2 × 1/50LB** | 2 cases of 50 lb each |
| **= 100 pc** | Total pieces/units |
| **$1.43/kg** | Normalized cost per kg |
| **Progress bar** | Stock level vs par level |

### 3.3 Stock Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| Green | **OK** | Stock above 50% of par |
| Yellow | **Warning** | Stock between 25-50% of par |
| Orange | **Low** | Stock between 10-25% of par |
| Red | **Critical** | Stock below 10% of par |

### 3.4 Filtering Inventory

Use the filter options to find items:

- **Search** - Type product name or SKU
- **Category** - Filter by food category
- **Status** - Show only low/critical stock
- **Vendor** - Filter by supplier

> **Screenshot placeholder:** *Inventory filters*

### 3.5 Viewing Item Details

Click any item to see full details:

- Complete product information
- Price history
- Stock movements
- Linked recipes
- Vendor information

> **Screenshot placeholder:** *Item detail modal*

---

## 4. Recipe Management

### 4.1 Creating a New Recipe

1. Click **"Recipes"** in the menu
2. Click **"New Recipe"** (+ button)
3. Enter the recipe name
4. Fill in basic information:
   - Category/Department
   - Yield (portions or weight)
   - Prep time / Cook time

> **Screenshot placeholder:** *New recipe form*

### 4.2 Adding Ingredients

1. In the recipe editor, scroll to **Ingredients**
2. Click **"Add Ingredient"**
3. Search for an inventory item or type a new ingredient
4. Enter the quantity and unit
5. Click **"Save"**

**Linking to Inventory:**
When you link an ingredient to an inventory item, the system:
- Calculates ingredient cost automatically
- Updates costs when prices change
- Deducts from inventory when tasks complete

> **Screenshot placeholder:** *Ingredient list with linking*

### 4.3 Recipe Costing

The recipe editor shows real-time cost calculations:

| Field | Description |
|-------|-------------|
| **Ingredient Cost** | Sum of all ingredient costs |
| **Cost per Portion** | Total cost ÷ yield |
| **Suggested Price** | Cost × markup factor |
| **Food Cost %** | Ingredient cost as % of price |

> **Screenshot placeholder:** *Recipe cost summary*

### 4.4 Method Steps

Add step-by-step cooking instructions:

1. Click **"Add Step"** in the Method section
2. Enter the instruction text
3. Optionally add:
   - **Timer** - Set a countdown for the step
   - **Temperature** - Specify cooking temperature
   - **Equipment** - Note required tools

**Using Timers:**
- Click the timer icon on any step
- Set minutes and seconds
- Timer will alert when complete during task execution

> **Screenshot placeholder:** *Method steps with timer*

### 4.5 Recipe Images

Add photos to your recipes:

1. Click the image placeholder
2. Upload a photo from your device
3. The AI can also parse recipes from photos

> **Screenshot placeholder:** *Recipe with image*

---

## 5. Task Management

Tasks connect recipes to daily production and inventory tracking.

### 5.1 Creating a Task

1. Open a recipe
2. Click **"Create Task"** or **"Assign"**
3. Fill in task details:
   - **Assigned to** - Select team member
   - **Due date/time** - When it should be completed
   - **Quantity** - How many batches/portions
   - **Department** - Which station/area
4. Click **"Create Task"**

> **Screenshot placeholder:** *Assign task modal*

### 5.2 Task Dependencies

When a recipe uses in-house ingredients, the system checks if prerequisites are met:

**Dependency Warning:**
```
⚠️ This recipe requires "Chicken Stock" which is low on inventory.
   Current: 2 L | Required: 5 L

   [Create Prerequisite Task]
```

Click **"Create Prerequisite Task"** to automatically create a task for the required prep.

> **Screenshot placeholder:** *Task dependency warning*

### 5.3 Viewing Tasks

**Department Tasks Page:**
- See all tasks for your department
- Filter by status (pending, in progress, completed)
- Sort by due date or priority

**My Tasks:**
- View tasks assigned to you
- Mark tasks as started/completed

> **Screenshot placeholder:** *Department tasks list*

### 5.4 Executing a Task

1. Click on a task to open it
2. Click **"Start Task"**
3. Follow the recipe steps:
   - Check off completed steps
   - Use timers as needed
   - Record any notes
4. Click **"Complete Task"**

**On Completion:**
- Ingredients are deducted from inventory
- Produced items are added to inventory (for prep recipes)
- Task is logged for reporting

> **Screenshot placeholder:** *Task execution view*

### 5.5 Bulk Task Dictation

Create multiple tasks using voice input:

1. Click the microphone icon
2. Speak your task list naturally:
   *"Make 10 portions of Caesar salad for lunch service, prep 5 liters of chicken stock for tomorrow"*
3. The AI parses your speech into individual tasks
4. Review and confirm

> **Screenshot placeholder:** *Voice task creation*

---

## 6. Purchase Orders

### 6.1 Auto-Generating Orders

SmartCookBook can automatically create purchase orders for low-stock items:

1. Go to **Inventory**
2. Click **"Generate Orders"**
3. Review the order preview:
   - Items to order
   - Suggested quantities
   - Estimated cost
4. Click **"Create Orders"**

Orders are grouped by vendor automatically.

> **Screenshot placeholder:** *Auto-order preview*

### 6.2 Managing Orders

View and edit orders in the **Orders** tab:

| Status | Meaning |
|--------|---------|
| **Draft** | Order created, not yet sent |
| **Sent** | Order sent to vendor |
| **Confirmed** | Vendor confirmed receipt |
| **Received** | Items received and inventory updated |

**To edit an order:**
1. Click on the order
2. Modify quantities or items
3. Save changes

> **Screenshot placeholder:** *Order management page*

### 6.3 Receiving Orders

When an order arrives:

1. Open the order
2. Click **"Receive Order"**
3. Verify quantities received
4. Note any discrepancies
5. Confirm receipt

Inventory is automatically updated with received quantities.

> **Screenshot placeholder:** *Order receiving screen*

---

## 7. Control Panel & Settings

### 7.1 User Management

**Adding Team Members:**

1. Go to **Control Panel** → **Users**
2. Click **"Add User"**
3. Enter user details and role
4. Set permissions:
   - **Admin** - Full access
   - **Manager** - Most features, no system settings
   - **Staff** - Basic operations only
5. Send invitation

> **Screenshot placeholder:** *User management panel*

### 7.2 Business Settings

Configure your business:

- **Business Name** - Displayed on reports
- **Address** - For invoices and orders
- **Logo** - Appears on PDFs
- **Tax Settings** - Configure tax rates
- **Currency** - Default currency display

> **Screenshot placeholder:** *Business settings*

### 7.3 Inventory Settings

- **Low Stock Threshold** - % that triggers low stock warning
- **Critical Stock Threshold** - % that triggers critical warning
- **Auto-Reorder** - Enable automatic order generation
- **Default Par Levels** - Set standard stock targets

### 7.4 Backup & Restore

**Creating a Backup:**

1. Go to **Control Panel** → **Backup**
2. Click **"Create Backup"**
3. Download the backup file

**Restoring from Backup:**

1. Click **"Restore Backup"**
2. Select your backup file
3. Confirm restoration

> **Warning:** Restoring a backup will overwrite current data.

> **Screenshot placeholder:** *Backup panel*

### 7.5 API Credits

SmartCookBook uses AI credits for certain features:

| Feature | Credits |
|---------|---------|
| Invoice Vision Parsing | 5 credits |
| Recipe Image Parsing | 5 credits |
| Recipe Text Parsing | 2 credits |
| Translation | 1 credit |
| Bulk Task Dictation | 3 credits |

**Monthly Allowance:** 50 credits per user

View your credits in **Settings** → **Credits Display**

> **Screenshot placeholder:** *Credits display*

---

## 8. Tips & Best Practices

### 8.1 Invoice Processing Tips

- **Use clear PDF scans** - Higher quality = better parsing accuracy
- **Process invoices promptly** - Keep prices up to date
- **Review before saving** - Catch any parsing errors early
- **Consistent vendor names** - Helps with automatic matching

### 8.2 Inventory Best Practices

- **Set realistic par levels** - Based on actual usage patterns
- **Regular stock checks** - Verify physical counts weekly
- **Link all recipe ingredients** - Enables automatic costing
- **Use the "In-House" view** - Track prep items separately

### 8.3 Recipe Management Tips

- **Break down complex dishes** - Create sub-recipes for components
- **Include all ingredients** - Even small amounts for accurate costing
- **Use consistent units** - Stick to metric or imperial
- **Add method timers** - Helps with consistent execution

### 8.4 Task Workflow

**Recommended daily workflow:**

1. **Morning:** Review today's tasks, check dependencies
2. **Pre-Service:** Execute prep tasks, mark complete
3. **Post-Service:** Log any additional prep done
4. **End of Day:** Review completed tasks, plan tomorrow

### 8.5 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Quick search |
| `Ctrl + N` | New recipe |
| `Escape` | Close modal |
| `Enter` | Confirm/Save |

---

## Need Help?

- **Documentation:** Check the `/docs` folder for technical details
- **Issues:** Report bugs at [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- **Support:** Contact your system administrator

---

*SmartCookBook - Professional Kitchen Management*

**Built with care for culinary professionals**

---

*This guide is for SmartCookBook v2.0. Features may vary in future versions.*
