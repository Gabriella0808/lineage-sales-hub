export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acctivate_sales_managers: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          job_title: string | null
          manager_code: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          manager_code?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          manager_code?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      acctivate_sales_reps: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          manager_acctivate_id: string | null
          manager_name: string | null
          name: string
          phone: string | null
          rep_code: string | null
          territory_acctivate_id: string | null
          territory_name: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name: string
          phone?: string | null
          rep_code?: string | null
          territory_acctivate_id?: string | null
          territory_name?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          rep_code?: string | null
          territory_acctivate_id?: string | null
          territory_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      acctivate_territories: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          description: string | null
          id: string
          manager_acctivate_id: string | null
          manager_name: string | null
          name: string
          territory_code: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name: string
          territory_code?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string
          territory_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          related_to: string | null
          related_type: string | null
          timestamp: string
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          related_to?: string | null
          related_type?: string | null
          timestamp?: string
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          related_to?: string | null
          related_type?: string | null
          timestamp?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      clearance_weekly_sales: {
        Row: {
          created_at: string
          id: string
          import_filename: string | null
          import_id: string
          imported_by: string | null
          product_name: string | null
          qty_sold: number
          rep_name: string | null
          revenue: number | null
          sku: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_filename?: string | null
          import_id: string
          imported_by?: string | null
          product_name?: string | null
          qty_sold?: number
          rep_name?: string | null
          revenue?: number | null
          sku: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          import_filename?: string | null
          import_id?: string
          imported_by?: string | null
          product_name?: string | null
          qty_sold?: number
          rep_name?: string | null
          revenue?: number | null
          sku?: string
          week_start?: string
        }
        Relationships: []
      }
      compare_periods_notes: {
        Row: {
          account: string
          collection: string
          created_at: string
          id: string
          note: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account: string
          collection: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account?: string
          collection?: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          assigned_to: string | null
          cell: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          territory: string | null
          title: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          cell?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          territory?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          cell?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          territory?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      crm_account_notes: {
        Row: {
          account_id: string
          body: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_account_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_account_stage_history: {
        Row: {
          account_id: string
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          to_stage: string
        }
        Insert: {
          account_id: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          to_stage: string
        }
        Update: {
          account_id?: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_account_stage_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_accounts: {
        Row: {
          account_type: string
          assigned_manager_id: string | null
          assigned_rep_id: string | null
          brand: string
          brands: string[]
          city: string | null
          company_name: string
          contact_first_name: string | null
          contact_last_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          lifecycle_stage: string
          main_phone: string | null
          notes: string | null
          prospect_type: string | null
          prospect_types: string[]
          state: string | null
          status: string
          street_1: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          account_type?: string
          assigned_manager_id?: string | null
          assigned_rep_id?: string | null
          brand?: string
          brands?: string[]
          city?: string | null
          company_name: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          main_phone?: string | null
          notes?: string | null
          prospect_type?: string | null
          prospect_types?: string[]
          state?: string | null
          status?: string
          street_1?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_type?: string
          assigned_manager_id?: string | null
          assigned_rep_id?: string | null
          brand?: string
          brands?: string[]
          city?: string | null
          company_name?: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          main_phone?: string | null
          notes?: string | null
          prospect_type?: string | null
          prospect_types?: string[]
          state?: string | null
          status?: string
          street_1?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_assigned_rep_id_fkey"
            columns: ["assigned_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_prospect_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_quote_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name: string
          product_id: string | null
          qty: number
          quote_id: string
          sku: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          name: string
          product_id?: string | null
          qty?: number
          quote_id: string
          sku: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          quote_id?: string
          sku?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_quotes: {
        Row: {
          created_at: string
          customer_company: string | null
          customer_email: string | null
          customer_name: string
          dealer_user_id: string
          footer_message: string | null
          id: string
          intro_message: string | null
          sent_at: string | null
          share_token: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_name: string
          dealer_user_id: string
          footer_message?: string | null
          id?: string
          intro_message?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          dealer_user_id?: string
          footer_message?: string | null
          id?: string
          intro_message?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      dbo_Customer: {
        Row: {
          _Rep1: string | null
          _Rep1CommRate: number | null
          _Rep2: string | null
          _Rep2CommRate: number | null
          _SalesManager: string | null
          _skyvia_sync: string | null
          _Territory: string | null
          AccountNumber: string | null
          Address: string | null
          Address2: string | null
          Address3: string | null
          Address4: string | null
          AlternateCustomerID: string | null
          AltPhone: string | null
          AltPhoneDesc: string | null
          AnnualSales: unknown
          ARAcntId: string | null
          AvgCollectionDays: number | null
          BalDue: unknown
          BranchID: string | null
          BranchName: string | null
          CCAddress: string | null
          CCDisplayNumber: string | null
          CCExpMonth: number | null
          CCExpYear: number | null
          CCName: string | null
          CCNumber: string | null
          CCPostalCode: string | null
          City: string | null
          ClosingAgeHistory: string | null
          Comment: string | null
          CompanyName: string | null
          Country: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          CreditHold: boolean | null
          CreditLimit: unknown
          CreditRating: string | null
          CreditRatingSource: string | null
          CurrencyCode: string | null
          CurrencyName: string | null
          CustId: string | null
          CustListID: string | null
          CustomerTaxID: string | null
          CustomerType: string | null
          DateOpened: string | null
          DefaultReference: string | null
          DefaultReference2: string | null
          Email: string | null
          EmailDesc: string | null
          Fax: string | null
          FaxDesc: string | null
          FirstInvoiceDate: string | null
          FirstName: string | null
          FullAddress: string | null
          FullName: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string
          GUIDCustomerType: string | null
          GUIDParent: string | null
          GUIDSalesperson: string | null
          GUIDTaxCode: string | null
          GUIDTemplate: string | null
          GUIDTerms: string | null
          IgnoreOverdueInvoices: boolean | null
          InvoiceText: string | null
          IsProject: boolean | null
          LastCreditReview: string | null
          LastName: string | null
          LastSalesOrderDate: string | null
          LocationId: string | null
          Login: string | null
          MarketingCode: string | null
          Method: number | null
          MiddleName: string | null
          Mobile: string | null
          MobileDesc: string | null
          Name: string | null
          OrderCount: number | null
          OwnershipStyle: string | null
          Pager: string | null
          PagerDesc: string | null
          Password: string | null
          Phone: string | null
          PhoneDesc: string | null
          PopupNotes: boolean | null
          PreferredPaymentMethod: string | null
          PriceCode: string | null
          ReferredBy: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          Salutation: string | null
          State: string | null
          StateSalesTaxId: string | null
          Status: boolean | null
          Suffix: string | null
          SyncAsCustomerID: string | null
          SyncAsGUIDCustomer: string | null
          SyncToken: string | null
          Taxable: boolean | null
          TaxCodeDescription: string | null
          TaxCodeName: string | null
          TaxExemptionReasonDesc: string | null
          TaxExemptionReasonID: number | null
          TaxIncluded: boolean | null
          TemplateID: string | null
          TermsCode: string | null
          TermsDescription: string | null
          TradeDiscountPct: number | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          WebAddress: string | null
          WebCustomerID: string | null
          Zip: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep1CommRate?: number | null
          _Rep2?: string | null
          _Rep2CommRate?: number | null
          _SalesManager?: string | null
          _skyvia_sync?: string | null
          _Territory?: string | null
          AccountNumber?: string | null
          Address?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AlternateCustomerID?: string | null
          AltPhone?: string | null
          AltPhoneDesc?: string | null
          AnnualSales?: unknown
          ARAcntId?: string | null
          AvgCollectionDays?: number | null
          BalDue?: unknown
          BranchID?: string | null
          BranchName?: string | null
          CCAddress?: string | null
          CCDisplayNumber?: string | null
          CCExpMonth?: number | null
          CCExpYear?: number | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          City?: string | null
          ClosingAgeHistory?: string | null
          Comment?: string | null
          CompanyName?: string | null
          Country?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditHold?: boolean | null
          CreditLimit?: unknown
          CreditRating?: string | null
          CreditRatingSource?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustId?: string | null
          CustListID?: string | null
          CustomerTaxID?: string | null
          CustomerType?: string | null
          DateOpened?: string | null
          DefaultReference?: string | null
          DefaultReference2?: string | null
          Email?: string | null
          EmailDesc?: string | null
          Fax?: string | null
          FaxDesc?: string | null
          FirstInvoiceDate?: string | null
          FirstName?: string | null
          FullAddress?: string | null
          FullName?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer: string
          GUIDCustomerType?: string | null
          GUIDParent?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          IgnoreOverdueInvoices?: boolean | null
          InvoiceText?: string | null
          IsProject?: boolean | null
          LastCreditReview?: string | null
          LastName?: string | null
          LastSalesOrderDate?: string | null
          LocationId?: string | null
          Login?: string | null
          MarketingCode?: string | null
          Method?: number | null
          MiddleName?: string | null
          Mobile?: string | null
          MobileDesc?: string | null
          Name?: string | null
          OrderCount?: number | null
          OwnershipStyle?: string | null
          Pager?: string | null
          PagerDesc?: string | null
          Password?: string | null
          Phone?: string | null
          PhoneDesc?: string | null
          PopupNotes?: boolean | null
          PreferredPaymentMethod?: string | null
          PriceCode?: string | null
          ReferredBy?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          Salutation?: string | null
          State?: string | null
          StateSalesTaxId?: string | null
          Status?: boolean | null
          Suffix?: string | null
          SyncAsCustomerID?: string | null
          SyncAsGUIDCustomer?: string | null
          SyncToken?: string | null
          Taxable?: boolean | null
          TaxCodeDescription?: string | null
          TaxCodeName?: string | null
          TaxExemptionReasonDesc?: string | null
          TaxExemptionReasonID?: number | null
          TaxIncluded?: boolean | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TradeDiscountPct?: number | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebAddress?: string | null
          WebCustomerID?: string | null
          Zip?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep1CommRate?: number | null
          _Rep2?: string | null
          _Rep2CommRate?: number | null
          _SalesManager?: string | null
          _skyvia_sync?: string | null
          _Territory?: string | null
          AccountNumber?: string | null
          Address?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AlternateCustomerID?: string | null
          AltPhone?: string | null
          AltPhoneDesc?: string | null
          AnnualSales?: unknown
          ARAcntId?: string | null
          AvgCollectionDays?: number | null
          BalDue?: unknown
          BranchID?: string | null
          BranchName?: string | null
          CCAddress?: string | null
          CCDisplayNumber?: string | null
          CCExpMonth?: number | null
          CCExpYear?: number | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          City?: string | null
          ClosingAgeHistory?: string | null
          Comment?: string | null
          CompanyName?: string | null
          Country?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditHold?: boolean | null
          CreditLimit?: unknown
          CreditRating?: string | null
          CreditRatingSource?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustId?: string | null
          CustListID?: string | null
          CustomerTaxID?: string | null
          CustomerType?: string | null
          DateOpened?: string | null
          DefaultReference?: string | null
          DefaultReference2?: string | null
          Email?: string | null
          EmailDesc?: string | null
          Fax?: string | null
          FaxDesc?: string | null
          FirstInvoiceDate?: string | null
          FirstName?: string | null
          FullAddress?: string | null
          FullName?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string
          GUIDCustomerType?: string | null
          GUIDParent?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          IgnoreOverdueInvoices?: boolean | null
          InvoiceText?: string | null
          IsProject?: boolean | null
          LastCreditReview?: string | null
          LastName?: string | null
          LastSalesOrderDate?: string | null
          LocationId?: string | null
          Login?: string | null
          MarketingCode?: string | null
          Method?: number | null
          MiddleName?: string | null
          Mobile?: string | null
          MobileDesc?: string | null
          Name?: string | null
          OrderCount?: number | null
          OwnershipStyle?: string | null
          Pager?: string | null
          PagerDesc?: string | null
          Password?: string | null
          Phone?: string | null
          PhoneDesc?: string | null
          PopupNotes?: boolean | null
          PreferredPaymentMethod?: string | null
          PriceCode?: string | null
          ReferredBy?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          Salutation?: string | null
          State?: string | null
          StateSalesTaxId?: string | null
          Status?: boolean | null
          Suffix?: string | null
          SyncAsCustomerID?: string | null
          SyncAsGUIDCustomer?: string | null
          SyncToken?: string | null
          Taxable?: boolean | null
          TaxCodeDescription?: string | null
          TaxCodeName?: string | null
          TaxExemptionReasonDesc?: string | null
          TaxExemptionReasonID?: number | null
          TaxIncluded?: boolean | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TradeDiscountPct?: number | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebAddress?: string | null
          WebCustomerID?: string | null
          Zip?: string | null
        }
        Relationships: []
      }
      dbo_CustomerShipToInfo: {
        Row: {
          _skyvia_sync: string | null
          Comment: string | null
          DefaultJobNumber: string | null
          Distance: number | null
          FOB: string | null
          GUIDDistributionCenter: string | null
          GUIDLocation: string
          GUIDRoute: string | null
          GUIDWarehouse: string | null
          HoldFromDate: string | null
          HoldShipments: boolean | null
          HoldToDate: string | null
          IsDistributionCenter: boolean | null
          MapReference: string | null
          Route: string | null
          Routing: string | null
          ShippingInstructions: string | null
          ShipVia: string | null
          SpecialInstructions: string | null
          StopNumber: number | null
        }
        Insert: {
          _skyvia_sync?: string | null
          Comment?: string | null
          DefaultJobNumber?: string | null
          Distance?: number | null
          FOB?: string | null
          GUIDDistributionCenter?: string | null
          GUIDLocation: string
          GUIDRoute?: string | null
          GUIDWarehouse?: string | null
          HoldFromDate?: string | null
          HoldShipments?: boolean | null
          HoldToDate?: string | null
          IsDistributionCenter?: boolean | null
          MapReference?: string | null
          Route?: string | null
          Routing?: string | null
          ShippingInstructions?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
        }
        Update: {
          _skyvia_sync?: string | null
          Comment?: string | null
          DefaultJobNumber?: string | null
          Distance?: number | null
          FOB?: string | null
          GUIDDistributionCenter?: string | null
          GUIDLocation?: string
          GUIDRoute?: string | null
          GUIDWarehouse?: string | null
          HoldFromDate?: string | null
          HoldShipments?: boolean | null
          HoldToDate?: string | null
          IsDistributionCenter?: boolean | null
          MapReference?: string | null
          Route?: string | null
          Routing?: string | null
          ShippingInstructions?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
        }
        Relationships: []
      }
      dbo_Invoice: {
        Row: {
          _skyvia_sync: string | null
          AmtPaid: unknown
          ARAccountID: string | null
          BackorderCriteria: string | null
          Balance: unknown
          BankId: string | null
          BillToAddress: string | null
          BillToAddress1: string | null
          BillToAddress2: string | null
          BillToAddress3: string | null
          BillToAddress4: string | null
          BillToCity: string | null
          BillToCountry: string | null
          BillToName: string | null
          BillToState: string | null
          BillToZip: string | null
          BranchID: string | null
          Carrier: string | null
          CarrierAndService: string | null
          CarrierService: string | null
          CCAuthorizationCode: string | null
          CCAVSStreet: number | null
          CCAVSZip: number | null
          CCExpDate: string | null
          CCMerchAcctNumber: string | null
          CCNumber: string | null
          CCPaymentGroupingCode: number | null
          CCReconBatchID: string | null
          CCStatusCode: number | null
          CCStatusMessage: string | null
          CCTransID: string | null
          CCTxnAuthStamp: number | null
          CCTxnAuthTime: string | null
          CheckNo: string | null
          Class: string | null
          CollectionDays: number | null
          Comment: string | null
          CompanyTaxID: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFAX: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractDate: string | null
          ContractID: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          CurrencyCode: string | null
          CurrencyName: string | null
          CustomerID: string | null
          CustomerTaxID: string | null
          DateCompleted: string | null
          DatePosted: string | null
          DatePrinted: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscountAmount: unknown
          DiscountAvailable: unknown
          DiscountDate: string | null
          DiscountType: string | null
          DoNotSync: boolean | null
          DueDate: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          ExportDate: string | null
          Exported: boolean | null
          FOB: string | null
          ForeignAmtPaid: unknown
          ForeignBalance: unknown
          ForeignDiscountAmount: unknown
          ForeignDiscountAvailable: unknown
          ForeignPaymentDiscount: unknown
          ForeignSalesTax: unknown
          ForeignShippingCharge: unknown
          ForeignSubTotal: unknown
          ForeignTotalAmount: unknown
          ForeignTotalShippingCharges: unknown
          FromQB: boolean | null
          FrtTaxPct: number | null
          GUIDARAccount: string | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount: string | null
          GUIDLocation: string | null
          GUIDOrder: string | null
          GUIDPaymentMethod: string | null
          GUIDRetainageGLAccount: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDShippingChargeAccount: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InDispute: boolean | null
          InvoiceDate: string | null
          InvoiceDetailReportID: number | null
          InvoiceDiscountAccountID: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormat: string | null
          InvoiceFormatGUID: string | null
          InvoiceLink: string | null
          InvoiceNumber: string | null
          InvoiceNumberSort: string | null
          InvoiceReportID: number | null
          InvoiceStyle: string | null
          InvoiceText: string | null
          JobID: string | null
          JobNumber: string | null
          LastPaymentDate: string | null
          LastShipmentDate: string | null
          LocationID: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          Note: string | null
          NumberOfPackages: number | null
          NumberShipments: number | null
          OrderDate: string | null
          OrderNumber: string | null
          PackageWeight: number | null
          PaymentDiscount: unknown
          PaymentMethod: string | null
          PO: string | null
          PostedToAR: boolean | null
          PreviousAmount: unknown
          PreviousRetainage: unknown
          Printed: boolean | null
          ReadyToPrint: boolean | null
          Reference: string | null
          Reference2: string | null
          RequestedShipDate: string | null
          RetainageAmount: unknown
          RetainageBilled: boolean | null
          RetainageGLAccountID: string | null
          Route: string | null
          Routing: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          SalesTax: unknown
          ScheduleOfValuesType: string | null
          ShipmentPromisedDate: string | null
          ShippingCharge: unknown
          ShippingChargeAccountID: string | null
          ShippingInstructions: string | null
          ShipToAddress: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToOverride: boolean | null
          ShipToPhoneNumber: string | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          SpecialInstructions: string | null
          StopNumber: number | null
          SubTotal: unknown
          Taxable: boolean | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          TaxID: string | null
          TaxIncluded: boolean | null
          TaxPct: number | null
          TermsCode: string | null
          TermsDescription: string | null
          TotalAmount: unknown
          TotalShippingCharges: unknown
          TrackingNumber: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          TxnID: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          ARAccountID?: string | null
          BackorderCriteria?: string | null
          Balance?: unknown
          BankId?: string | null
          BillToAddress?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Class?: string | null
          CollectionDays?: number | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignBalance?: unknown
          ForeignDiscountAmount?: unknown
          ForeignDiscountAvailable?: unknown
          ForeignPaymentDiscount?: unknown
          ForeignSalesTax?: unknown
          ForeignShippingCharge?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDetailReportID?: number | null
          InvoiceDiscountAccountID?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceNumberSort?: string | null
          InvoiceReportID?: number | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastPaymentDate?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PaymentDiscount?: unknown
          PaymentMethod?: string | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          RetainageGLAccountID?: string | null
          Route?: string | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingChargeAccountID?: string | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          ARAccountID?: string | null
          BackorderCriteria?: string | null
          Balance?: unknown
          BankId?: string | null
          BillToAddress?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Class?: string | null
          CollectionDays?: number | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignBalance?: unknown
          ForeignDiscountAmount?: unknown
          ForeignDiscountAvailable?: unknown
          ForeignPaymentDiscount?: unknown
          ForeignSalesTax?: unknown
          ForeignShippingCharge?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDInvoice?: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDetailReportID?: number | null
          InvoiceDiscountAccountID?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceNumberSort?: string | null
          InvoiceReportID?: number | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastPaymentDate?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PaymentDiscount?: unknown
          PaymentMethod?: string | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          RetainageGLAccountID?: string | null
          Route?: string | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingChargeAccountID?: string | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Relationships: []
      }
      dbo_InvoiceDetail: {
        Row: {
          _CommissionOverride: number | null
          _FreightAmt: unknown
          _FreightPct: number | null
          _OriginalPrice: unknown
          _skyvia_sync: string | null
          _TariffAmt: unknown
          _TariffPct: number | null
          ActivityDate: string | null
          Amount: unknown
          AvgCost: number | null
          BillingType: string | null
          CGSAccountID: string | null
          CGSAmount: unknown
          CGSAmountPostedToGL: unknown
          CGSPostedToGL: boolean | null
          Class: string | null
          ComponentLevel: number | null
          ComponentQuantity: number | null
          CostUnit: string | null
          CurrentCGSAccountID: string | null
          CurrentChangeOrderAdditions: unknown
          CurrentChangeOrderDeductions: unknown
          CustomerProductID: string | null
          Description: string | null
          Discountable: boolean | null
          DisplayAmount: unknown
          DisplayPrice: number | null
          DisplayQtyBackOrdered: number | null
          DisplayQtyOrdered: number | null
          DisplayQtyShipped: number | null
          DisplayUnit: string | null
          DisplayUnitFactor: number | null
          EmployeeID: string | null
          ForeignAmount: unknown
          ForeignDisplayAmount: unknown
          ForeignDisplayPrice: number | null
          ForeignInvoiceDiscountAmount: unknown
          ForeignLineTaxAmount: unknown
          ForeignLineTaxPrice: number | null
          ForeignListPrice: number | null
          ForeignPrice: number | null
          ForeignSalesAmount: unknown
          Freight: boolean | null
          GLTransactionBatch: number | null
          GLTransactionLine: number | null
          GUIDCGSAccount: string | null
          GUIDClass: string | null
          GUIDEmployee: string | null
          GUIDInvoice: string | null
          GUIDInvoiceDetail: string
          GUIDIssue: string | null
          GUIDOrderDetail: string | null
          GUIDProduct: string | null
          GUIDProductClass: string | null
          GUIDSalesAccount: string | null
          GUIDTaxCode: string | null
          GUIDWarehouse: string | null
          InventoryControlType: string | null
          InvoiceComment: string | null
          InvoiceDate: string | null
          InvoiceDiscountAmount: unknown
          InvoiceNumber: string | null
          LineCancelled: boolean | null
          LineDiscountPct: number | null
          LineNumber: number | null
          LineTaxAmount: unknown
          LineTaxPrice: number | null
          LineType: string | null
          ListPrice: number | null
          ListPriceType: string | null
          MgmtCost: number | null
          MiscChargeType: string | null
          Note: string | null
          OrderNumber: string | null
          PercentCompleteLastBilling: number | null
          PercentCompleteThisBilling: number | null
          PreviousBilling: unknown
          PreviousChangeOrderAdditions: unknown
          PreviousChangeOrderDeductions: unknown
          PreviousRetainage: unknown
          Price: number | null
          PriceCode: string | null
          PriceUnit: string | null
          ProductClass: string | null
          ProductID: string | null
          ProductTaxID: string | null
          ProductTaxPct: number | null
          QtyBackOrdered: number | null
          QtyInvoiced: number | null
          QtyOrdered: number | null
          QtyShipped: number | null
          Reference: string | null
          RetainageAmount: unknown
          RetainagePercent: number | null
          SalesAccountID: string | null
          SalesAmount: unknown
          ScheduledValue: unknown
          ScheduleOfValuesCode: string | null
          ShortDescription: string | null
          SpecialInstructions: string | null
          StoredMaterials: unknown
          SubLineNumber: number | null
          Taxable: boolean | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          TransactionDate: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          Unit: string | null
          UnitCost: number | null
          Warehouse: string | null
        }
        Insert: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAccountID?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          Class?: string | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentCGSAccountID?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignListPrice?: number | null
          ForeignPrice?: number | null
          ForeignSalesAmount?: unknown
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDate?: string | null
          InvoiceDiscountAmount?: unknown
          InvoiceNumber?: string | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAccountID?: string | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
          Warehouse?: string | null
        }
        Update: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAccountID?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          Class?: string | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentCGSAccountID?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignListPrice?: number | null
          ForeignPrice?: number | null
          ForeignSalesAmount?: unknown
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail?: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDate?: string | null
          InvoiceDiscountAmount?: unknown
          InvoiceNumber?: string | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAccountID?: string | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
          Warehouse?: string | null
        }
        Relationships: []
      }
      dbo_Orders: {
        Row: {
          _Rep1: string | null
          _Rep2: string | null
          _Rep2Pct: number | null
          _RepPct: number | null
          _skyvia_sync: string | null
          AmtPaid: unknown
          BackorderCriteria: string | null
          BankId: string | null
          BeingPickedBy: string | null
          BranchID: string | null
          BranchName: string | null
          Carrier: string | null
          CarrierAndService: string | null
          CarrierService: string | null
          CCAddress: string | null
          CCExpDate: string | null
          CCName: string | null
          CCNumber: string | null
          CCPostalCode: string | null
          CheckNo: string | null
          Class: string | null
          Comment: string | null
          CompanyName: string | null
          CompanyTaxID: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFax: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractID: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          CurrencyCode: string | null
          CurrencyName: string | null
          CustomerID: string | null
          CustomerTaxID: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscAmt: unknown
          DiscountAmount: unknown
          DiscountType: string | null
          DontShipAfter: string | null
          DontShipBefore: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          FOB: string | null
          ForeignAmtPaid: unknown
          ForeignDiscountAmount: unknown
          ForeignPendingShippingCharges: unknown
          ForeignSalesTax: unknown
          ForeignSchedDiscountAmount: unknown
          ForeignSchedSalesTax: unknown
          ForeignSchedShippingCharge: unknown
          ForeignSchedSubTotal: unknown
          ForeignSchedTermsDiscountAvailable: unknown
          ForeignSchedTotalAmount: unknown
          ForeignSubTotal: unknown
          ForeignTotalAmount: unknown
          ForeignTotalShippingCharges: unknown
          FromEDI: boolean | null
          FrtTaxPct: number | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string | null
          GUIDCustomerType: string | null
          GUIDLocation: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus: string | null
          GUIDPaymentMethod: string | null
          GUIDRelatedOrder: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTemplate: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormat: string | null
          InvoiceFormatGUID: string | null
          InvoicingError: boolean | null
          InvoicingErrorMessage: string | null
          JobNumber: string | null
          LastShipmentDate: string | null
          LocationID: string | null
          LostBusinessCode: string | null
          LostBusinessComment: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          NextInvoiceNumber: string | null
          NextShipmentNumber: number | null
          Note: string | null
          NumberOfPackages: number | null
          OrderDate: string | null
          OrderNumber: string | null
          OrderNumberSort: string | null
          OrderStatus: string | null
          OrderStatusDescription: string | null
          OriginID: string | null
          OriginType: string | null
          PackageWeight: number | null
          PaymentMethod: string | null
          PendingShippingCharges: unknown
          PickTicketPrinted: boolean | null
          PickTicketReadyToPrint: boolean | null
          PO: string | null
          Printed: boolean | null
          QuotedDaysToShip: number | null
          ReadyToInvoice: boolean | null
          ReadyToPrint: boolean | null
          Reference: string | null
          Reference2: string | null
          RelatedOrderNumber: string | null
          RequestedShipDate: string | null
          Route: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          SalesTax: unknown
          SchedDiscountAmount: unknown
          SchedSalesTax: unknown
          SchedShippingCharge: unknown
          SchedSubTotal: unknown
          SchedTermsDiscountAvailable: unknown
          SchedTotalAmount: unknown
          ScheduledWeight: number | null
          ShipmentPromisedDate: string | null
          ShippingDocumentPrinted: boolean | null
          ShippingDocumentReadyToPrint: boolean | null
          ShippingInstructions: string | null
          ShipQuoteDate: string | null
          ShipQuoteGUIDTemplate: string | null
          ShipQuoteID: string | null
          ShipToAddress: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToDescription: string | null
          ShipToOverride: boolean | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          ShipWorkstationExportDate: string | null
          ShipWorkstationShipmentID: string | null
          SoldToAddress: string | null
          SoldToAddress1: string | null
          SoldToAddress2: string | null
          SoldToAddress3: string | null
          SoldToAddress4: string | null
          SoldToCity: string | null
          SoldToCountry: string | null
          SoldToName: string | null
          SoldToOverride: boolean | null
          SoldToState: string | null
          SoldToZip: string | null
          SpecialInstructions: string | null
          StatusChangedBy: string | null
          StatusDate: string | null
          StopNumber: number | null
          SubTotal: unknown
          Taxable: boolean | null
          TaxCatID: string | null
          TaxIncluded: boolean | null
          TaxPct: number | null
          TaxPercentText: string | null
          TemplateID: string | null
          TermsCode: string | null
          TermsDescription: string | null
          TotalAmount: unknown
          TotalShippingCharges: number | null
          TrackingNumber: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          WebOrder: boolean | null
          WebOrderID: string | null
          WebOrderNumber: string | null
          WorkFlowStatus: string | null
          WorkFlowStatusAbbreviation: string | null
          WorkFlowStatusChangedBy: string | null
          WorkFlowStatusDate: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          BranchID?: string | null
          BranchName?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Class?: string | null
          Comment?: string | null
          CompanyName?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignDiscountAmount?: unknown
          ForeignPendingShippingCharges?: unknown
          ForeignSalesTax?: unknown
          ForeignSchedDiscountAmount?: unknown
          ForeignSchedSalesTax?: unknown
          ForeignSchedShippingCharge?: unknown
          ForeignSchedSubTotal?: unknown
          ForeignSchedTermsDiscountAvailable?: unknown
          ForeignSchedTotalAmount?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromEDI?: boolean | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OrderStatusDescription?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PaymentMethod?: string | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RelatedOrderNumber?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ScheduledWeight?: number | null
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCatID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: number | null
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebOrder?: boolean | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatus?: string | null
          WorkFlowStatusAbbreviation?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          BranchID?: string | null
          BranchName?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Class?: string | null
          Comment?: string | null
          CompanyName?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignDiscountAmount?: unknown
          ForeignPendingShippingCharges?: unknown
          ForeignSalesTax?: unknown
          ForeignSchedDiscountAmount?: unknown
          ForeignSchedSalesTax?: unknown
          ForeignSchedShippingCharge?: unknown
          ForeignSchedSubTotal?: unknown
          ForeignSchedTermsDiscountAvailable?: unknown
          ForeignSchedTotalAmount?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromEDI?: boolean | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OrderStatusDescription?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PaymentMethod?: string | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RelatedOrderNumber?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ScheduledWeight?: number | null
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCatID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: number | null
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebOrder?: boolean | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatus?: string | null
          WorkFlowStatusAbbreviation?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Relationships: []
      }
      dbo_Product: {
        Row: {
          _CommissionPct: number | null
          _NewIntroUnavail: boolean | null
          _QBID: string | null
          _RoyaltyParty: string | null
          _RoyaltyPct: number | null
          _skyvia_sync: string | null
          AltDescription: string | null
          AlternateProductID: string | null
          AlternateUnit: string
          AlternateUnitConversionFactor: number | null
          AltHeight: number | null
          AltLength: number | null
          AltUnitsPerPalletLayer: number | null
          AltVolume: number | null
          AltWeight: number | null
          AltWidth: number | null
          AssemblyType: string | null
          AvailOnWeb: boolean | null
          Color: string | null
          CostMethod: string | null
          CountCycle: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          Description: string | null
          Discontinued: boolean | null
          ExternalDocument: string | null
          GUIDProduct: string
          GUIDProductClass: string | null
          GUIDTaxCategory: string | null
          Height: number | null
          InnerPackQty: number | null
          InventoryControlType: string | null
          ItemType: string | null
          Keywords: string | null
          LandedCostFactor: number | null
          LeadTime: number | null
          Length: number | null
          ListPrice: number | null
          ListPriceTaxIncluded: boolean | null
          ListPriceType: string | null
          ListPriceUnit: string | null
          MaintainInventoryType: number | null
          Note: string | null
          NotForResale: boolean | null
          OuterPackQty: number | null
          PackageUnit: string | null
          PalletLayers: number | null
          PiecesPerStockUnit: number | null
          PONote: string | null
          POPopup: boolean | null
          Popup: boolean | null
          PreferredGUIDVendor: string | null
          PreferredVendorID: string | null
          ProductClassID: string | null
          ProductID: string | null
          ProductPicture: string | null
          ProductPicture256: string | null
          ProductPriceCategory: string | null
          ProductType: string | null
          PurchaseGUIDTaxCode: string | null
          PurchaseUnit: string | null
          SalesCategory: string | null
          SalesGUIDTaxCode: string | null
          SalesUnit: string | null
          ShipCompleteLots: boolean | null
          ShortDescription: string | null
          Size: string | null
          Specification: string | null
          Status: boolean | null
          Taxable: boolean | null
          TechSpec: string | null
          Unit: string | null
          UPC: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          VariableHeight: boolean | null
          VariableLength: boolean | null
          VariableVolume: boolean | null
          VariableWeight: boolean | null
          VariableWidth: boolean | null
          Volume: number | null
          WebAddress: string | null
          Weight: number | null
          Width: number | null
        }
        Insert: {
          _CommissionPct?: number | null
          _NewIntroUnavail?: boolean | null
          _QBID?: string | null
          _RoyaltyParty?: string | null
          _RoyaltyPct?: number | null
          _skyvia_sync?: string | null
          AltDescription?: string | null
          AlternateProductID?: string | null
          AlternateUnit: string
          AlternateUnitConversionFactor?: number | null
          AltHeight?: number | null
          AltLength?: number | null
          AltUnitsPerPalletLayer?: number | null
          AltVolume?: number | null
          AltWeight?: number | null
          AltWidth?: number | null
          AssemblyType?: string | null
          AvailOnWeb?: boolean | null
          Color?: string | null
          CostMethod?: string | null
          CountCycle?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Discontinued?: boolean | null
          ExternalDocument?: string | null
          GUIDProduct: string
          GUIDProductClass?: string | null
          GUIDTaxCategory?: string | null
          Height?: number | null
          InnerPackQty?: number | null
          InventoryControlType?: string | null
          ItemType?: string | null
          Keywords?: string | null
          LandedCostFactor?: number | null
          LeadTime?: number | null
          Length?: number | null
          ListPrice?: number | null
          ListPriceTaxIncluded?: boolean | null
          ListPriceType?: string | null
          ListPriceUnit?: string | null
          MaintainInventoryType?: number | null
          Note?: string | null
          NotForResale?: boolean | null
          OuterPackQty?: number | null
          PackageUnit?: string | null
          PalletLayers?: number | null
          PiecesPerStockUnit?: number | null
          PONote?: string | null
          POPopup?: boolean | null
          Popup?: boolean | null
          PreferredGUIDVendor?: string | null
          PreferredVendorID?: string | null
          ProductClassID?: string | null
          ProductID?: string | null
          ProductPicture?: string | null
          ProductPicture256?: string | null
          ProductPriceCategory?: string | null
          ProductType?: string | null
          PurchaseGUIDTaxCode?: string | null
          PurchaseUnit?: string | null
          SalesCategory?: string | null
          SalesGUIDTaxCode?: string | null
          SalesUnit?: string | null
          ShipCompleteLots?: boolean | null
          ShortDescription?: string | null
          Size?: string | null
          Specification?: string | null
          Status?: boolean | null
          Taxable?: boolean | null
          TechSpec?: string | null
          Unit?: string | null
          UPC?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          VariableHeight?: boolean | null
          VariableLength?: boolean | null
          VariableVolume?: boolean | null
          VariableWeight?: boolean | null
          VariableWidth?: boolean | null
          Volume?: number | null
          WebAddress?: string | null
          Weight?: number | null
          Width?: number | null
        }
        Update: {
          _CommissionPct?: number | null
          _NewIntroUnavail?: boolean | null
          _QBID?: string | null
          _RoyaltyParty?: string | null
          _RoyaltyPct?: number | null
          _skyvia_sync?: string | null
          AltDescription?: string | null
          AlternateProductID?: string | null
          AlternateUnit?: string
          AlternateUnitConversionFactor?: number | null
          AltHeight?: number | null
          AltLength?: number | null
          AltUnitsPerPalletLayer?: number | null
          AltVolume?: number | null
          AltWeight?: number | null
          AltWidth?: number | null
          AssemblyType?: string | null
          AvailOnWeb?: boolean | null
          Color?: string | null
          CostMethod?: string | null
          CountCycle?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Discontinued?: boolean | null
          ExternalDocument?: string | null
          GUIDProduct?: string
          GUIDProductClass?: string | null
          GUIDTaxCategory?: string | null
          Height?: number | null
          InnerPackQty?: number | null
          InventoryControlType?: string | null
          ItemType?: string | null
          Keywords?: string | null
          LandedCostFactor?: number | null
          LeadTime?: number | null
          Length?: number | null
          ListPrice?: number | null
          ListPriceTaxIncluded?: boolean | null
          ListPriceType?: string | null
          ListPriceUnit?: string | null
          MaintainInventoryType?: number | null
          Note?: string | null
          NotForResale?: boolean | null
          OuterPackQty?: number | null
          PackageUnit?: string | null
          PalletLayers?: number | null
          PiecesPerStockUnit?: number | null
          PONote?: string | null
          POPopup?: boolean | null
          Popup?: boolean | null
          PreferredGUIDVendor?: string | null
          PreferredVendorID?: string | null
          ProductClassID?: string | null
          ProductID?: string | null
          ProductPicture?: string | null
          ProductPicture256?: string | null
          ProductPriceCategory?: string | null
          ProductType?: string | null
          PurchaseGUIDTaxCode?: string | null
          PurchaseUnit?: string | null
          SalesCategory?: string | null
          SalesGUIDTaxCode?: string | null
          SalesUnit?: string | null
          ShipCompleteLots?: boolean | null
          ShortDescription?: string | null
          Size?: string | null
          Specification?: string | null
          Status?: boolean | null
          Taxable?: boolean | null
          TechSpec?: string | null
          Unit?: string | null
          UPC?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          VariableHeight?: boolean | null
          VariableLength?: boolean | null
          VariableVolume?: boolean | null
          VariableWeight?: boolean | null
          VariableWidth?: boolean | null
          Volume?: number | null
          WebAddress?: string | null
          Weight?: number | null
          Width?: number | null
        }
        Relationships: []
      }
      dbo_ProductWarehouse: {
        Row: {
          _skyvia_sync: string | null
          CountInProgress: number | null
          Deleted: boolean | null
          GUIDProduct: string | null
          GUIDProductWarehouse: string
          GUIDWarehouse: string | null
          GUIDWHLocation: string | null
          LastCost: number | null
          LastCountDate: string | null
          Location: string | null
          MgmtCost: number | null
          Note: string | null
          PrimaryLocationStockingLevel: number | null
          ProductID: string | null
          QtyReserved: number | null
          QtyToReorder: number | null
          ReorderPoint: number | null
          StandardCost: number | null
          StdCost: number | null
          StockingLevel: number | null
          UnitCost: number | null
          Value: unknown
          Warehouse: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          CountInProgress?: number | null
          Deleted?: boolean | null
          GUIDProduct?: string | null
          GUIDProductWarehouse: string
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          LastCost?: number | null
          LastCountDate?: string | null
          Location?: string | null
          MgmtCost?: number | null
          Note?: string | null
          PrimaryLocationStockingLevel?: number | null
          ProductID?: string | null
          QtyReserved?: number | null
          QtyToReorder?: number | null
          ReorderPoint?: number | null
          StandardCost?: number | null
          StdCost?: number | null
          StockingLevel?: number | null
          UnitCost?: number | null
          Value?: unknown
          Warehouse?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          CountInProgress?: number | null
          Deleted?: boolean | null
          GUIDProduct?: string | null
          GUIDProductWarehouse?: string
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          LastCost?: number | null
          LastCountDate?: string | null
          Location?: string | null
          MgmtCost?: number | null
          Note?: string | null
          PrimaryLocationStockingLevel?: number | null
          ProductID?: string | null
          QtyReserved?: number | null
          QtyToReorder?: number | null
          ReorderPoint?: number | null
          StandardCost?: number | null
          StdCost?: number | null
          StockingLevel?: number | null
          UnitCost?: number | null
          Value?: unknown
          Warehouse?: string | null
        }
        Relationships: []
      }
      dbo_SalespersonInfo: {
        Row: {
          _skyvia_sync: string | null
          COGSAccountSegment: string | null
          GUIDClass: string | null
          GUIDCOGSAccount: string | null
          GUIDLink: string | null
          GUIDReturnsAccount: string | null
          GUIDSalesAccount: string | null
          GUIDSalesperson: string
          GUIDTradeDiscount: string | null
          ItemListID: string | null
          LinkType: string | null
          Name: string | null
          ReturnsAccountSegment: string | null
          SalesAccountSegment: string | null
          SalespersonID: string | null
          SalespersonListID: string | null
          Status: boolean | null
          TimeCreated: string | null
          TimeModified: string | null
          TradeDiscountSegment: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          COGSAccountSegment?: string | null
          GUIDClass?: string | null
          GUIDCOGSAccount?: string | null
          GUIDLink?: string | null
          GUIDReturnsAccount?: string | null
          GUIDSalesAccount?: string | null
          GUIDSalesperson: string
          GUIDTradeDiscount?: string | null
          ItemListID?: string | null
          LinkType?: string | null
          Name?: string | null
          ReturnsAccountSegment?: string | null
          SalesAccountSegment?: string | null
          SalespersonID?: string | null
          SalespersonListID?: string | null
          Status?: boolean | null
          TimeCreated?: string | null
          TimeModified?: string | null
          TradeDiscountSegment?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          COGSAccountSegment?: string | null
          GUIDClass?: string | null
          GUIDCOGSAccount?: string | null
          GUIDLink?: string | null
          GUIDReturnsAccount?: string | null
          GUIDSalesAccount?: string | null
          GUIDSalesperson?: string
          GUIDTradeDiscount?: string | null
          ItemListID?: string | null
          LinkType?: string | null
          Name?: string | null
          ReturnsAccountSegment?: string | null
          SalesAccountSegment?: string | null
          SalespersonID?: string | null
          SalespersonListID?: string | null
          Status?: boolean | null
          TimeCreated?: string | null
          TimeModified?: string | null
          TradeDiscountSegment?: string | null
        }
        Relationships: []
      }
      dbo_tbCustomer: {
        Row: {
          _Rep1: string | null
          _Rep1CommRate: number | null
          _Rep2: string | null
          _Rep2CommRate: number | null
          _SalesManager: string | null
          _skyvia_sync: string | null
          _Territory: string | null
          AccountNumber: string | null
          Address: string | null
          Address2: string | null
          Address3: string | null
          Address4: string | null
          AltPhone: string | null
          AltPhoneDesc: string | null
          CCAddress: string | null
          CCDisplayNumber: string | null
          CCExpMonth: number | null
          CCExpYear: number | null
          CCName: string | null
          CCNumber: string | null
          CCPostalCode: string | null
          City: string | null
          Comment: string | null
          CompanyName: string | null
          Country: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          CreditHold: boolean | null
          CreditLimit: unknown
          CustId: string | null
          CustListID: string | null
          Email: string | null
          EmailDesc: string | null
          Fax: string | null
          FaxDesc: string | null
          FirstName: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string
          GUIDCustomerType: string | null
          GUIDParent: string | null
          GUIDSalesperson: string | null
          GUIDTaxCode: string | null
          GUIDTerms: string | null
          IsProject: boolean | null
          LastName: string | null
          LocationId: string | null
          Method: number | null
          MiddleName: string | null
          Mobile: string | null
          MobileDesc: string | null
          Name: string | null
          Pager: string | null
          PagerDesc: string | null
          Phone: string | null
          PhoneDesc: string | null
          PopupNotes: boolean | null
          PreferredPaymentMethod: string | null
          Salutation: string | null
          State: string | null
          StateSalesTaxId: string | null
          Status: boolean | null
          Suffix: string | null
          SyncAsGUIDCustomer: string | null
          SyncToken: string | null
          TaxExemptionReasonID: number | null
          TaxIncluded: boolean | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          Zip: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep1CommRate?: number | null
          _Rep2?: string | null
          _Rep2CommRate?: number | null
          _SalesManager?: string | null
          _skyvia_sync?: string | null
          _Territory?: string | null
          AccountNumber?: string | null
          Address?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AltPhone?: string | null
          AltPhoneDesc?: string | null
          CCAddress?: string | null
          CCDisplayNumber?: string | null
          CCExpMonth?: number | null
          CCExpYear?: number | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          City?: string | null
          Comment?: string | null
          CompanyName?: string | null
          Country?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditHold?: boolean | null
          CreditLimit?: unknown
          CustId?: string | null
          CustListID?: string | null
          Email?: string | null
          EmailDesc?: string | null
          Fax?: string | null
          FaxDesc?: string | null
          FirstName?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer: string
          GUIDCustomerType?: string | null
          GUIDParent?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          IsProject?: boolean | null
          LastName?: string | null
          LocationId?: string | null
          Method?: number | null
          MiddleName?: string | null
          Mobile?: string | null
          MobileDesc?: string | null
          Name?: string | null
          Pager?: string | null
          PagerDesc?: string | null
          Phone?: string | null
          PhoneDesc?: string | null
          PopupNotes?: boolean | null
          PreferredPaymentMethod?: string | null
          Salutation?: string | null
          State?: string | null
          StateSalesTaxId?: string | null
          Status?: boolean | null
          Suffix?: string | null
          SyncAsGUIDCustomer?: string | null
          SyncToken?: string | null
          TaxExemptionReasonID?: number | null
          TaxIncluded?: boolean | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          Zip?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep1CommRate?: number | null
          _Rep2?: string | null
          _Rep2CommRate?: number | null
          _SalesManager?: string | null
          _skyvia_sync?: string | null
          _Territory?: string | null
          AccountNumber?: string | null
          Address?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AltPhone?: string | null
          AltPhoneDesc?: string | null
          CCAddress?: string | null
          CCDisplayNumber?: string | null
          CCExpMonth?: number | null
          CCExpYear?: number | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          City?: string | null
          Comment?: string | null
          CompanyName?: string | null
          Country?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditHold?: boolean | null
          CreditLimit?: unknown
          CustId?: string | null
          CustListID?: string | null
          Email?: string | null
          EmailDesc?: string | null
          Fax?: string | null
          FaxDesc?: string | null
          FirstName?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string
          GUIDCustomerType?: string | null
          GUIDParent?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          IsProject?: boolean | null
          LastName?: string | null
          LocationId?: string | null
          Method?: number | null
          MiddleName?: string | null
          Mobile?: string | null
          MobileDesc?: string | null
          Name?: string | null
          Pager?: string | null
          PagerDesc?: string | null
          Phone?: string | null
          PhoneDesc?: string | null
          PopupNotes?: boolean | null
          PreferredPaymentMethod?: string | null
          Salutation?: string | null
          State?: string | null
          StateSalesTaxId?: string | null
          Status?: boolean | null
          Suffix?: string | null
          SyncAsGUIDCustomer?: string | null
          SyncToken?: string | null
          TaxExemptionReasonID?: number | null
          TaxIncluded?: boolean | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          Zip?: string | null
        }
        Relationships: []
      }
      dbo_tbInvoice: {
        Row: {
          _skyvia_sync: string | null
          AmtPaid: unknown
          BackorderCriteria: string | null
          BankId: string | null
          BillToAddress1: string | null
          BillToAddress2: string | null
          BillToAddress3: string | null
          BillToAddress4: string | null
          BillToCity: string | null
          BillToCountry: string | null
          BillToName: string | null
          BillToState: string | null
          BillToZip: string | null
          BranchID: string | null
          Carrier: string | null
          CarrierService: string | null
          CCAuthorizationCode: string | null
          CCAVSStreet: number | null
          CCAVSZip: number | null
          CCExpDate: string | null
          CCMerchAcctNumber: string | null
          CCNumber: string | null
          CCPaymentGroupingCode: number | null
          CCReconBatchID: string | null
          CCStatusCode: number | null
          CCStatusMessage: string | null
          CCTransID: string | null
          CCTxnAuthStamp: number | null
          CCTxnAuthTime: string | null
          CheckNo: string | null
          Comment: string | null
          CompanyTaxID: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFAX: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractDate: string | null
          ContractID: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          CustomerID: string | null
          CustomerTaxID: string | null
          DateCompleted: string | null
          DatePosted: string | null
          DatePrinted: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscountAmount: unknown
          DiscountAvailable: unknown
          DiscountDate: string | null
          DiscountType: string | null
          DoNotSync: boolean | null
          DueDate: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          ExportDate: string | null
          Exported: boolean | null
          FOB: string | null
          FromQB: boolean | null
          FrtTaxPct: number | null
          GUIDARAccount: string | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string | null
          GUIDDepartment: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount: string | null
          GUIDLocation: string | null
          GUIDOrder: string | null
          GUIDOrderWorkflowStatus: string | null
          GUIDPaymentMethod: string | null
          GUIDRetainageGLAccount: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDShippingChargeAccount: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InDispute: boolean | null
          InvoiceDate: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormatGUID: string | null
          InvoiceLink: string | null
          InvoiceNumber: string | null
          InvoiceStyle: string | null
          InvoiceText: string | null
          JobID: string | null
          JobNumber: string | null
          LastShipmentDate: string | null
          LocationID: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          Note: string | null
          NumberOfPackages: number | null
          NumberShipments: number | null
          OrderDate: string | null
          OrderNumber: string | null
          PackageWeight: number | null
          PO: string | null
          PostedToAR: boolean | null
          PreviousAmount: unknown
          PreviousRetainage: unknown
          Printed: boolean | null
          ReadyToPrint: boolean | null
          Reference: string | null
          Reference2: string | null
          RequestedShipDate: string | null
          RetainageAmount: unknown
          RetainageBilled: boolean | null
          Routing: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          SalesTax: unknown
          ScheduleOfValuesType: string | null
          ShipmentPromisedDate: string | null
          ShippingCharge: unknown
          ShippingInstructions: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToOverride: boolean | null
          ShipToPhoneNumber: string | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          SpecialInstructions: string | null
          StopNumber: number | null
          SubTotal: unknown
          SyncToken: string | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          TaxID: string | null
          TaxIncluded: boolean | null
          TaxPct: number | null
          TermsCode: string | null
          TermsDescription: string | null
          TotalAmount: unknown
          TrackingNumber: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          TxnID: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDDepartment?: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDOrderWorkflowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingInstructions?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          SyncToken?: string | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDDepartment?: string | null
          GUIDInvoice?: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDOrderWorkflowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingInstructions?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          SyncToken?: string | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Relationships: []
      }
      dbo_tbInvoiceDetail: {
        Row: {
          _CommissionOverride: number | null
          _FreightAmt: unknown
          _FreightPct: number | null
          _OriginalPrice: unknown
          _skyvia_sync: string | null
          _TariffAmt: unknown
          _TariffPct: number | null
          ActivityDate: string | null
          Amount: unknown
          AvgCost: number | null
          BillingType: string | null
          CGSAmount: unknown
          CGSAmountPostedToGL: unknown
          CGSPostedToGL: boolean | null
          ComponentLevel: number | null
          ComponentQuantity: number | null
          CostUnit: string | null
          CurrentChangeOrderAdditions: unknown
          CurrentChangeOrderDeductions: unknown
          Description: string | null
          Discountable: boolean | null
          DisplayAmount: unknown
          DisplayPrice: number | null
          DisplayUnit: string | null
          DisplayUnitFactor: number | null
          Freight: boolean | null
          GLTransactionBatch: number | null
          GLTransactionLine: number | null
          GUIDCGSAccount: string | null
          GUIDClass: string | null
          GUIDEmployee: string | null
          GUIDInvoice: string | null
          GUIDInvoiceDetail: string
          GUIDIssue: string | null
          GUIDOrderDetail: string | null
          GUIDProduct: string | null
          GUIDProductClass: string | null
          GUIDSalesAccount: string | null
          GUIDTaxCode: string | null
          GUIDWarehouse: string | null
          GUIDWHLocation: string | null
          InventoryControlType: string | null
          InvoiceComment: string | null
          InvoiceDiscountAmount: unknown
          LineCancelled: boolean | null
          LineDiscountPct: number | null
          LineNumber: number | null
          LineTaxAmount: unknown
          LineTaxPrice: number | null
          LineType: string | null
          ListPrice: number | null
          ListPriceType: string | null
          MgmtCost: number | null
          MiscChargeType: string | null
          Note: string | null
          PercentCompleteLastBilling: number | null
          PercentCompleteThisBilling: number | null
          PreviousBilling: unknown
          PreviousChangeOrderAdditions: unknown
          PreviousChangeOrderDeductions: unknown
          PreviousRetainage: unknown
          Price: number | null
          PriceCode: string | null
          PriceUnit: string | null
          ProductID: string | null
          ProductTaxID: string | null
          ProductTaxPct: number | null
          QtyBackOrdered: number | null
          QtyInvoiced: number | null
          QtyOrdered: number | null
          QtyShipped: number | null
          Reference: string | null
          RetainageAmount: unknown
          RetainagePercent: number | null
          SalesAmount: unknown
          ScheduledValue: unknown
          ScheduleOfValuesCode: string | null
          SpecialInstructions: string | null
          StoredMaterials: unknown
          SubLineNumber: number | null
          TransactionDate: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          Unit: string | null
          UnitCost: number | null
        }
        Insert: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
        }
        Update: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail?: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
        }
        Relationships: []
      }
      dbo_tbOrderDetail: {
        Row: {
          _CommissionOverride: number | null
          _FreightAmt: unknown
          _FreightPct: number | null
          _OriginalPrice: unknown
          _skyvia_sync: string | null
          _TariffAmt: unknown
          _TariffPct: number | null
          ActivityDate: string | null
          Amount: unknown
          BillingType: string | null
          Completed: boolean | null
          ComponentLevel: number | null
          ComponentQuantity: number | null
          CreatePO: boolean | null
          Description: string | null
          Discountable: boolean | null
          DisplayAmount: unknown
          DisplayPrice: number | null
          DisplayUnit: string | null
          DisplayUnitFactor: number | null
          Exported940: boolean | null
          Exported940Date: string | null
          Freight: boolean | null
          GUIDClass: string | null
          GUIDEmployee: string | null
          GUIDIssue: string | null
          GUIDOrder: string | null
          GUIDOrderDetail: string
          GUIDParentOrderDetail: string | null
          GUIDPODetail: string | null
          GUIDProduct: string | null
          GUIDProductClass: string | null
          GUIDSubstituteForProduct: string | null
          GUIDTaxCode: string | null
          GUIDVendor: string | null
          GUIDWarehouse: string | null
          GUIDWHLocation: string | null
          InventoryControlType: string | null
          InvoiceComment: string | null
          InvoiceDiscountAmount: unknown
          Length: number | null
          LineCancelled: boolean | null
          LineDiscountPct: number | null
          LineNumber: number | null
          LineTaxAmount: unknown
          LineTaxPrice: number | null
          LineType: string | null
          MiscChargeType: string | null
          Note: string | null
          POGUIDTaxCode: string | null
          POPrice: number | null
          Price: number | null
          PriceCode: string | null
          PriceUnit: string | null
          PriceUnitFactor: number | null
          PriceUnitFactorType: string | null
          ProductID: string | null
          ProductTaxID: string | null
          ProductTaxPct: number | null
          QtyBackordered: number | null
          QtyInvoiced: number | null
          QtyLotSerial: number | null
          QtyOrdered: number | null
          QtyPicked: number | null
          QtyScheduled: number | null
          QtyShipped: number | null
          Reference: string | null
          SalesCategory: string | null
          SchedAmount: unknown
          SchedInvoiceDiscountAmount: unknown
          SchedLineTaxAmount: unknown
          SpecialInstructions: string | null
          Specification: string | null
          SubLineNumber: number | null
          ToBeBilled: boolean | null
          Unit: string | null
          VariableLength: boolean | null
          VariableWeight: boolean | null
          VendorProductID: string | null
          WebOrderLineID: string | null
          Weight: number | null
        }
        Insert: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          BillingType?: string | null
          Completed?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CreatePO?: boolean | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          Exported940?: boolean | null
          Exported940Date?: string | null
          Freight?: boolean | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDIssue?: string | null
          GUIDOrder?: string | null
          GUIDOrderDetail: string
          GUIDParentOrderDetail?: string | null
          GUIDPODetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSubstituteForProduct?: string | null
          GUIDTaxCode?: string | null
          GUIDVendor?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          Length?: number | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          MiscChargeType?: string | null
          Note?: string | null
          POGUIDTaxCode?: string | null
          POPrice?: number | null
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          PriceUnitFactor?: number | null
          PriceUnitFactorType?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackordered?: number | null
          QtyInvoiced?: number | null
          QtyLotSerial?: number | null
          QtyOrdered?: number | null
          QtyPicked?: number | null
          QtyScheduled?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          SalesCategory?: string | null
          SchedAmount?: unknown
          SchedInvoiceDiscountAmount?: unknown
          SchedLineTaxAmount?: unknown
          SpecialInstructions?: string | null
          Specification?: string | null
          SubLineNumber?: number | null
          ToBeBilled?: boolean | null
          Unit?: string | null
          VariableLength?: boolean | null
          VariableWeight?: boolean | null
          VendorProductID?: string | null
          WebOrderLineID?: string | null
          Weight?: number | null
        }
        Update: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          BillingType?: string | null
          Completed?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CreatePO?: boolean | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          Exported940?: boolean | null
          Exported940Date?: string | null
          Freight?: boolean | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDIssue?: string | null
          GUIDOrder?: string | null
          GUIDOrderDetail?: string
          GUIDParentOrderDetail?: string | null
          GUIDPODetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSubstituteForProduct?: string | null
          GUIDTaxCode?: string | null
          GUIDVendor?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          Length?: number | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          MiscChargeType?: string | null
          Note?: string | null
          POGUIDTaxCode?: string | null
          POPrice?: number | null
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          PriceUnitFactor?: number | null
          PriceUnitFactorType?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackordered?: number | null
          QtyInvoiced?: number | null
          QtyLotSerial?: number | null
          QtyOrdered?: number | null
          QtyPicked?: number | null
          QtyScheduled?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          SalesCategory?: string | null
          SchedAmount?: unknown
          SchedInvoiceDiscountAmount?: unknown
          SchedLineTaxAmount?: unknown
          SpecialInstructions?: string | null
          Specification?: string | null
          SubLineNumber?: number | null
          ToBeBilled?: boolean | null
          Unit?: string | null
          VariableLength?: boolean | null
          VariableWeight?: boolean | null
          VendorProductID?: string | null
          WebOrderLineID?: string | null
          Weight?: number | null
        }
        Relationships: []
      }
      dbo_tbProduct: {
        Row: {
          _CommissionPct: number | null
          _NewIntroUnavail: boolean | null
          _QBID: string | null
          _RoyaltyParty: string | null
          _RoyaltyPct: number | null
          _skyvia_sync: string | null
          AltDescription: string | null
          AltHeight: number | null
          AltLength: number | null
          AltUnitsPerPalletLayer: number | null
          AltVolume: number | null
          AltWeight: number | null
          AltWidth: number | null
          AssemblyType: string | null
          AvailOnWeb: boolean | null
          Color: string | null
          CostMethod: string | null
          CountCycle: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          Description: string | null
          Discontinued: boolean | null
          GUIDProduct: string
          GUIDProductClass: string | null
          GUIDTaxCategory: string | null
          Height: number | null
          InnerPackQty: number | null
          InventoryControlType: string | null
          LandedCostFactor: number | null
          LeadTime: number | null
          Length: number | null
          MaintainInventoryType: number | null
          Note: string | null
          NotForResale: boolean | null
          OuterPackQty: number | null
          PackageUnit: string | null
          PalletLayers: number | null
          PONote: string | null
          POPopup: boolean | null
          Popup: boolean | null
          ProductID: string | null
          ProductPicture: string | null
          ProductPicture256: string | null
          ProductPriceCategory: string | null
          ProductType: string | null
          PurchaseGUIDTaxCode: string | null
          PurchaseUnit: string | null
          SalesCategory: string | null
          SalesGUIDTaxCode: string | null
          SalesUnit: string | null
          ShipCompleteLots: boolean | null
          Size: string | null
          Specification: string | null
          Status: boolean | null
          TechSpec: string | null
          Unit: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          VariableHeight: boolean | null
          VariableLength: boolean | null
          VariableVolume: boolean | null
          VariableWeight: boolean | null
          VariableWidth: boolean | null
          Volume: number | null
          WebAddress: string | null
          Weight: number | null
          Width: number | null
        }
        Insert: {
          _CommissionPct?: number | null
          _NewIntroUnavail?: boolean | null
          _QBID?: string | null
          _RoyaltyParty?: string | null
          _RoyaltyPct?: number | null
          _skyvia_sync?: string | null
          AltDescription?: string | null
          AltHeight?: number | null
          AltLength?: number | null
          AltUnitsPerPalletLayer?: number | null
          AltVolume?: number | null
          AltWeight?: number | null
          AltWidth?: number | null
          AssemblyType?: string | null
          AvailOnWeb?: boolean | null
          Color?: string | null
          CostMethod?: string | null
          CountCycle?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Discontinued?: boolean | null
          GUIDProduct: string
          GUIDProductClass?: string | null
          GUIDTaxCategory?: string | null
          Height?: number | null
          InnerPackQty?: number | null
          InventoryControlType?: string | null
          LandedCostFactor?: number | null
          LeadTime?: number | null
          Length?: number | null
          MaintainInventoryType?: number | null
          Note?: string | null
          NotForResale?: boolean | null
          OuterPackQty?: number | null
          PackageUnit?: string | null
          PalletLayers?: number | null
          PONote?: string | null
          POPopup?: boolean | null
          Popup?: boolean | null
          ProductID?: string | null
          ProductPicture?: string | null
          ProductPicture256?: string | null
          ProductPriceCategory?: string | null
          ProductType?: string | null
          PurchaseGUIDTaxCode?: string | null
          PurchaseUnit?: string | null
          SalesCategory?: string | null
          SalesGUIDTaxCode?: string | null
          SalesUnit?: string | null
          ShipCompleteLots?: boolean | null
          Size?: string | null
          Specification?: string | null
          Status?: boolean | null
          TechSpec?: string | null
          Unit?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          VariableHeight?: boolean | null
          VariableLength?: boolean | null
          VariableVolume?: boolean | null
          VariableWeight?: boolean | null
          VariableWidth?: boolean | null
          Volume?: number | null
          WebAddress?: string | null
          Weight?: number | null
          Width?: number | null
        }
        Update: {
          _CommissionPct?: number | null
          _NewIntroUnavail?: boolean | null
          _QBID?: string | null
          _RoyaltyParty?: string | null
          _RoyaltyPct?: number | null
          _skyvia_sync?: string | null
          AltDescription?: string | null
          AltHeight?: number | null
          AltLength?: number | null
          AltUnitsPerPalletLayer?: number | null
          AltVolume?: number | null
          AltWeight?: number | null
          AltWidth?: number | null
          AssemblyType?: string | null
          AvailOnWeb?: boolean | null
          Color?: string | null
          CostMethod?: string | null
          CountCycle?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Discontinued?: boolean | null
          GUIDProduct?: string
          GUIDProductClass?: string | null
          GUIDTaxCategory?: string | null
          Height?: number | null
          InnerPackQty?: number | null
          InventoryControlType?: string | null
          LandedCostFactor?: number | null
          LeadTime?: number | null
          Length?: number | null
          MaintainInventoryType?: number | null
          Note?: string | null
          NotForResale?: boolean | null
          OuterPackQty?: number | null
          PackageUnit?: string | null
          PalletLayers?: number | null
          PONote?: string | null
          POPopup?: boolean | null
          Popup?: boolean | null
          ProductID?: string | null
          ProductPicture?: string | null
          ProductPicture256?: string | null
          ProductPriceCategory?: string | null
          ProductType?: string | null
          PurchaseGUIDTaxCode?: string | null
          PurchaseUnit?: string | null
          SalesCategory?: string | null
          SalesGUIDTaxCode?: string | null
          SalesUnit?: string | null
          ShipCompleteLots?: boolean | null
          Size?: string | null
          Specification?: string | null
          Status?: boolean | null
          TechSpec?: string | null
          Unit?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          VariableHeight?: boolean | null
          VariableLength?: boolean | null
          VariableVolume?: boolean | null
          VariableWeight?: boolean | null
          VariableWidth?: boolean | null
          Volume?: number | null
          WebAddress?: string | null
          Weight?: number | null
          Width?: number | null
        }
        Relationships: []
      }
      dbo_tbSalespersonInfo: {
        Row: {
          _skyvia_sync: string | null
          GUIDClass: string | null
          GUIDCOGSAccount: string | null
          GUIDLink: string | null
          GUIDReturnsAccount: string | null
          GUIDSalesAccount: string | null
          GUIDSalesperson: string
          GUIDTradeDiscount: string | null
          ItemListID: string | null
          LinkType: string | null
          Name: string | null
          SalespersonID: string | null
          SalespersonListID: string | null
          Status: boolean | null
          TimeCreated: string | null
          TimeModified: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          GUIDClass?: string | null
          GUIDCOGSAccount?: string | null
          GUIDLink?: string | null
          GUIDReturnsAccount?: string | null
          GUIDSalesAccount?: string | null
          GUIDSalesperson: string
          GUIDTradeDiscount?: string | null
          ItemListID?: string | null
          LinkType?: string | null
          Name?: string | null
          SalespersonID?: string | null
          SalespersonListID?: string | null
          Status?: boolean | null
          TimeCreated?: string | null
          TimeModified?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          GUIDClass?: string | null
          GUIDCOGSAccount?: string | null
          GUIDLink?: string | null
          GUIDReturnsAccount?: string | null
          GUIDSalesAccount?: string | null
          GUIDSalesperson?: string
          GUIDTradeDiscount?: string | null
          ItemListID?: string | null
          LinkType?: string | null
          Name?: string | null
          SalespersonID?: string | null
          SalespersonListID?: string | null
          Status?: boolean | null
          TimeCreated?: string | null
          TimeModified?: string | null
        }
        Relationships: []
      }
      dbo_Warehouse: {
        Row: {
          _skyvia_sync: string | null
          Active: boolean | null
          Address: string | null
          Address1: string | null
          Address2: string | null
          Address3: string | null
          Address4: string | null
          AdjustmentAccountID: string | null
          AllowPicklists: boolean | null
          AssemblyLaborAccountID: string | null
          AssemblyOtherCostAccountID: string | null
          AssociatedBranchID: string | null
          AssociatedGUIDBranch: string | null
          City: string | null
          Country: string | null
          Description: string | null
          EMail: string | null
          FAX: string | null
          FOB: string | null
          GainLossAccountID: string | null
          GUIDAdjustmentAccount: string | null
          GUIDAssemblyLaborAccount: string | null
          GUIDAssemblyOtherCostAccount: string | null
          GUIDDepartment: string | null
          GUIDGainLossAccount: string | null
          GUIDInventoryAccount: string | null
          GUIDIssueAccount: string | null
          GUIDLaborOffsetAccount: string | null
          GUIDLandedCostOffsetAccount: string | null
          GUIDNonInvOffsetAccount: string | null
          GUIDOtherChargeOffsetAccount: string | null
          GUIDPartner: string | null
          GUIDPurchaseAccount: string | null
          GUIDShippingOffsetAccount: string | null
          GUIDWarehouse: string
          InventoryAccountID: string | null
          IssueAccountID: string | null
          LaborCost: unknown
          LaborOffsetAccountID: string | null
          LandedCostOffsetAccountID: string | null
          Layout: string | null
          MaintainInventory: boolean | null
          Name: string | null
          NonInvOffsetAccountID: string | null
          OtherChargeOffsetAccountID: string | null
          Phone: string | null
          PurchaseAccountID: string | null
          ShippingOffsetAccountID: string | null
          ShipToAttentionOf: string | null
          ShipVia: string | null
          State: string | null
          WarehouseID: string | null
          Zip: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          Active?: boolean | null
          Address?: string | null
          Address1?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AdjustmentAccountID?: string | null
          AllowPicklists?: boolean | null
          AssemblyLaborAccountID?: string | null
          AssemblyOtherCostAccountID?: string | null
          AssociatedBranchID?: string | null
          AssociatedGUIDBranch?: string | null
          City?: string | null
          Country?: string | null
          Description?: string | null
          EMail?: string | null
          FAX?: string | null
          FOB?: string | null
          GainLossAccountID?: string | null
          GUIDAdjustmentAccount?: string | null
          GUIDAssemblyLaborAccount?: string | null
          GUIDAssemblyOtherCostAccount?: string | null
          GUIDDepartment?: string | null
          GUIDGainLossAccount?: string | null
          GUIDInventoryAccount?: string | null
          GUIDIssueAccount?: string | null
          GUIDLaborOffsetAccount?: string | null
          GUIDLandedCostOffsetAccount?: string | null
          GUIDNonInvOffsetAccount?: string | null
          GUIDOtherChargeOffsetAccount?: string | null
          GUIDPartner?: string | null
          GUIDPurchaseAccount?: string | null
          GUIDShippingOffsetAccount?: string | null
          GUIDWarehouse: string
          InventoryAccountID?: string | null
          IssueAccountID?: string | null
          LaborCost?: unknown
          LaborOffsetAccountID?: string | null
          LandedCostOffsetAccountID?: string | null
          Layout?: string | null
          MaintainInventory?: boolean | null
          Name?: string | null
          NonInvOffsetAccountID?: string | null
          OtherChargeOffsetAccountID?: string | null
          Phone?: string | null
          PurchaseAccountID?: string | null
          ShippingOffsetAccountID?: string | null
          ShipToAttentionOf?: string | null
          ShipVia?: string | null
          State?: string | null
          WarehouseID?: string | null
          Zip?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          Active?: boolean | null
          Address?: string | null
          Address1?: string | null
          Address2?: string | null
          Address3?: string | null
          Address4?: string | null
          AdjustmentAccountID?: string | null
          AllowPicklists?: boolean | null
          AssemblyLaborAccountID?: string | null
          AssemblyOtherCostAccountID?: string | null
          AssociatedBranchID?: string | null
          AssociatedGUIDBranch?: string | null
          City?: string | null
          Country?: string | null
          Description?: string | null
          EMail?: string | null
          FAX?: string | null
          FOB?: string | null
          GainLossAccountID?: string | null
          GUIDAdjustmentAccount?: string | null
          GUIDAssemblyLaborAccount?: string | null
          GUIDAssemblyOtherCostAccount?: string | null
          GUIDDepartment?: string | null
          GUIDGainLossAccount?: string | null
          GUIDInventoryAccount?: string | null
          GUIDIssueAccount?: string | null
          GUIDLaborOffsetAccount?: string | null
          GUIDLandedCostOffsetAccount?: string | null
          GUIDNonInvOffsetAccount?: string | null
          GUIDOtherChargeOffsetAccount?: string | null
          GUIDPartner?: string | null
          GUIDPurchaseAccount?: string | null
          GUIDShippingOffsetAccount?: string | null
          GUIDWarehouse?: string
          InventoryAccountID?: string | null
          IssueAccountID?: string | null
          LaborCost?: unknown
          LaborOffsetAccountID?: string | null
          LandedCostOffsetAccountID?: string | null
          Layout?: string | null
          MaintainInventory?: boolean | null
          Name?: string | null
          NonInvOffsetAccountID?: string | null
          OtherChargeOffsetAccountID?: string | null
          Phone?: string | null
          PurchaseAccountID?: string | null
          ShippingOffsetAccountID?: string | null
          ShipToAttentionOf?: string | null
          ShipVia?: string | null
          State?: string | null
          WarehouseID?: string | null
          Zip?: string | null
        }
        Relationships: []
      }
      dealer_acctivate_uuids: {
        Row: {
          acctivate_uuid: string
          created_at: string
          dealer_id: string
        }
        Insert: {
          acctivate_uuid: string
          created_at?: string
          dealer_id: string
        }
        Update: {
          acctivate_uuid?: string
          created_at?: string
          dealer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_acctivate_uuids_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_branding: {
        Row: {
          company_name: string | null
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          footer_message: string | null
          intro_message: string | null
          logo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          footer_message?: string | null
          intro_message?: string | null
          logo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          footer_message?: string | null
          intro_message?: string | null
          logo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dealer_check_ins: {
        Row: {
          brand: string | null
          created_at: string
          dealer_id: string
          id: string
          log_type: string | null
          new_placement: string | null
          notes: string | null
          outcome: string | null
          updated_at: string
          user_id: string
          visit_date: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          dealer_id: string
          id?: string
          log_type?: string | null
          new_placement?: string | null
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id: string
          visit_date?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          dealer_id?: string
          id?: string
          log_type?: string | null
          new_placement?: string | null
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_check_ins_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_demand_signals: {
        Row: {
          created_at: string
          dealer_id: string | null
          dealer_name: string | null
          id: string
          notes: string | null
          signal_date: string
          signal_strength: number
          signal_type: string
          sku: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          id?: string
          notes?: string | null
          signal_date?: string
          signal_strength?: number
          signal_type: string
          sku: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          id?: string
          notes?: string | null
          signal_date?: string
          signal_strength?: number
          signal_type?: string
          sku?: string
        }
        Relationships: []
      }
      dealer_invoice_lines: {
        Row: {
          acctivate_id: string
          created_at: string
          dealer_acctivate_id: string | null
          dealer_id: string | null
          extended_price: number | null
          id: string
          invoice_acctivate_id: string | null
          invoice_date: string | null
          invoice_id: string | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          sku: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          extended_price?: number | null
          id?: string
          invoice_acctivate_id?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          extended_price?: number | null
          id?: string
          invoice_acctivate_id?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dealer_invoices: {
        Row: {
          acctivate_id: string
          balance: number | null
          branch: string | null
          created_at: string
          dealer_acctivate_id: string | null
          dealer_id: string | null
          due_date: string | null
          freight: number | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          po_number: string | null
          salesperson: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          terms: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          balance?: number | null
          branch?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          due_date?: string | null
          freight?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_number?: string | null
          salesperson?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          balance?: number | null
          branch?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          due_date?: string | null
          freight?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_number?: string | null
          salesperson?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_invoices_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_sales: {
        Row: {
          booking_count: number | null
          bookings: number | null
          created_at: string
          dealer_id: string
          id: string
          invoice_count: number | null
          invoices: number | null
          month: string
          order_count: number | null
          revenue: number | null
          updated_at: string
          year: number
        }
        Insert: {
          booking_count?: number | null
          bookings?: number | null
          created_at?: string
          dealer_id: string
          id?: string
          invoice_count?: number | null
          invoices?: number | null
          month: string
          order_count?: number | null
          revenue?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          booking_count?: number | null
          bookings?: number | null
          created_at?: string
          dealer_id?: string
          id?: string
          invoice_count?: number | null
          invoices?: number | null
          month?: string
          order_count?: number | null
          revenue?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dealer_sales_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_sales_lines: {
        Row: {
          booking_count: number
          bookings: number
          created_at: string
          dealer_id: string
          id: string
          invoice_count: number
          invoices: number
          month: string
          product_id: string
          updated_at: string
          year: number
        }
        Insert: {
          booking_count?: number
          bookings?: number
          created_at?: string
          dealer_id: string
          id?: string
          invoice_count?: number
          invoices?: number
          month: string
          product_id: string
          updated_at?: string
          year: number
        }
        Update: {
          booking_count?: number
          bookings?: number
          created_at?: string
          dealer_id?: string
          id?: string
          invoice_count?: number
          invoices?: number
          month?: string
          product_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      dealers: {
        Row: {
          acctivate_id: string | null
          buying_group: string | null
          city: string | null
          created_at: string
          crm_account_id: string | null
          email: string | null
          engagement: string | null
          first_name: string | null
          id: string
          last_contact: string | null
          last_name: string | null
          lat: number | null
          lng: number | null
          manager_id: string | null
          name: string
          notes: string | null
          phone: string | null
          rep_id: string | null
          rep_owner: string | null
          revenue: number | null
          sales_manager: string | null
          salesperson: string | null
          source: string
          state: string | null
          status: string
          street_address: string | null
          territory: string | null
          territory_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          acctivate_id?: string | null
          buying_group?: string | null
          city?: string | null
          created_at?: string
          crm_account_id?: string | null
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          sales_manager?: string | null
          salesperson?: string | null
          source?: string
          state?: string | null
          status?: string
          street_address?: string | null
          territory?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          acctivate_id?: string | null
          buying_group?: string | null
          city?: string | null
          created_at?: string
          crm_account_id?: string | null
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          sales_manager?: string | null
          salesperson?: string | null
          source?: string
          state?: string | null
          status?: string
          street_address?: string | null
          territory?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealers_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          resurrect_attempts: number
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          resurrect_attempts?: number
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          resurrect_attempts?: number
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          per_recipient_throttle_seconds: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          per_recipient_throttle_seconds?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          per_recipient_throttle_seconds?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          acctivate_id: string | null
          available: number | null
          avg_monthly_sales: number | null
          closeout_initial_qty: number | null
          closeout_units_sold: number | null
          collection: string | null
          created_at: string
          cubes: number | null
          factory: string | null
          forecast_monthly: number | null
          id: string
          in_transit: number | null
          is_clearance: boolean
          is_closeout: boolean
          is_discontinued: boolean
          last_synced_at: string | null
          lead_time_days: number | null
          lead_time_months: number | null
          link: string | null
          list_price: number | null
          months_supply: number | null
          moq: number | null
          on_hand: number | null
          on_hand_nc: number | null
          on_hand_value: number | null
          on_hand_vn: number | null
          on_po: number | null
          on_sales_order: number | null
          product: string
          received_date: string | null
          reorder_basis: string | null
          reorder_max: number | null
          reorder_min: number | null
          reorder_override_per_week: number | null
          sku: string
          status: string | null
          supplier: string | null
          unit_cost: number | null
          units_l12m: number | null
          units_l3m: number | null
          units_l6m: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          available?: number | null
          avg_monthly_sales?: number | null
          closeout_initial_qty?: number | null
          closeout_units_sold?: number | null
          collection?: string | null
          created_at?: string
          cubes?: number | null
          factory?: string | null
          forecast_monthly?: number | null
          id?: string
          in_transit?: number | null
          is_clearance?: boolean
          is_closeout?: boolean
          is_discontinued?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          lead_time_months?: number | null
          link?: string | null
          list_price?: number | null
          months_supply?: number | null
          moq?: number | null
          on_hand?: number | null
          on_hand_nc?: number | null
          on_hand_value?: number | null
          on_hand_vn?: number | null
          on_po?: number | null
          on_sales_order?: number | null
          product: string
          received_date?: string | null
          reorder_basis?: string | null
          reorder_max?: number | null
          reorder_min?: number | null
          reorder_override_per_week?: number | null
          sku: string
          status?: string | null
          supplier?: string | null
          unit_cost?: number | null
          units_l12m?: number | null
          units_l3m?: number | null
          units_l6m?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          available?: number | null
          avg_monthly_sales?: number | null
          closeout_initial_qty?: number | null
          closeout_units_sold?: number | null
          collection?: string | null
          created_at?: string
          cubes?: number | null
          factory?: string | null
          forecast_monthly?: number | null
          id?: string
          in_transit?: number | null
          is_clearance?: boolean
          is_closeout?: boolean
          is_discontinued?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          lead_time_months?: number | null
          link?: string | null
          list_price?: number | null
          months_supply?: number | null
          moq?: number | null
          on_hand?: number | null
          on_hand_nc?: number | null
          on_hand_value?: number | null
          on_hand_vn?: number | null
          on_po?: number | null
          on_sales_order?: number | null
          product?: string
          received_date?: string | null
          reorder_basis?: string | null
          reorder_max?: number | null
          reorder_min?: number | null
          reorder_override_per_week?: number | null
          sku?: string
          status?: string | null
          supplier?: string | null
          unit_cost?: number | null
          units_l12m?: number | null
          units_l3m?: number | null
          units_l6m?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      kpi_records: {
        Row: {
          conversion_rate: number | null
          created_at: string
          dealer_visits: number | null
          id: string
          month: string
          new_dealers: number | null
          quota: number | null
          rep_id: string
          revenue: number | null
          tasks_completed: number | null
          year: number
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string
          dealer_visits?: number | null
          id?: string
          month: string
          new_dealers?: number | null
          quota?: number | null
          rep_id: string
          revenue?: number | null
          tasks_completed?: number | null
          year: number
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string
          dealer_visits?: number | null
          id?: string
          month?: string
          new_dealers?: number | null
          quota?: number | null
          rep_id?: string
          revenue?: number | null
          tasks_completed?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_records_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_sales_events: {
        Row: {
          created_at: string
          dealer_name: string | null
          estimated_value: number
          event_date: string
          id: string
          qty_requested: number
          reason: string | null
          sku: string
        }
        Insert: {
          created_at?: string
          dealer_name?: string | null
          estimated_value?: number
          event_date: string
          id?: string
          qty_requested?: number
          reason?: string | null
          sku: string
        }
        Update: {
          created_at?: string
          dealer_name?: string | null
          estimated_value?: number
          event_date?: string
          id?: string
          qty_requested?: number
          reason?: string | null
          sku?: string
        }
        Relationships: []
      }
      manager_task_assignees: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_tasks: {
        Row: {
          assigned_manager_id: string | null
          assigned_user_id: string | null
          board_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          group_id: string | null
          id: string
          position: number | null
          status: Database["public"]["Enums"]["manager_task_status"]
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          assigned_manager_id?: string | null
          assigned_user_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          position?: number | null
          status?: Database["public"]["Enums"]["manager_task_status"]
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          assigned_manager_id?: string | null
          assigned_user_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          position?: number | null
          status?: Database["public"]["Enums"]["manager_task_status"]
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_board_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          acctivate_id: string | null
          created_at: string
          email: string | null
          id: string
          monday_id: string | null
          name: string
          phone: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          monday_id?: string | null
          name: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          monday_id?: string | null
          name?: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monday_boards: {
        Row: {
          created_at: string
          id: string
          monday_board_id: string
          name: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          monday_board_id: string
          name: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          monday_board_id?: string
          name?: string
          workspace_name?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      open_sales_orders: {
        Row: {
          acctivate_id: string | null
          created_at: string
          dealer_acctivate_id: string | null
          dealer_id: string | null
          dealer_name: string | null
          extended_value: number
          id: string
          last_synced_at: string | null
          order_date: string | null
          order_number: string | null
          promised_date: string | null
          qty_open: number
          rep: string | null
          sku: string
          stock_class: string | null
          stock_class_description: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          rep?: string | null
          sku: string
          stock_class?: string | null
          stock_class_description?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          rep?: string | null
          sku?: string
          stock_class?: string | null
          stock_class_description?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      org_position_dotted_reports: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          position_id: string
          reports_to_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          position_id: string
          reports_to_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          position_id?: string
          reports_to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_position_dotted_reports_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_position_dotted_reports_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_position_reviews: {
        Row: {
          areas_for_improvement: string | null
          created_at: string
          created_by: string | null
          goals_next_year: string | null
          id: string
          notes: string | null
          position_id: string
          rating: number | null
          review_year: number
          reviewer_name: string | null
          strengths: string | null
          updated_at: string
        }
        Insert: {
          areas_for_improvement?: string | null
          created_at?: string
          created_by?: string | null
          goals_next_year?: string | null
          id?: string
          notes?: string | null
          position_id: string
          rating?: number | null
          review_year: number
          reviewer_name?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Update: {
          areas_for_improvement?: string | null
          created_at?: string
          created_by?: string | null
          goals_next_year?: string | null
          id?: string
          notes?: string | null
          position_id?: string
          rating?: number | null
          review_year?: number
          reviewer_name?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_position_reviews_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_positions: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          holder_name: string | null
          id: string
          job_description: string | null
          main_objectives: string | null
          parent_id: string | null
          position_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          holder_name?: string | null
          id?: string
          job_description?: string | null
          main_objectives?: string | null
          parent_id?: string | null
          position_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          holder_name?: string | null
          id?: string
          job_description?: string | null
          main_objectives?: string | null
          parent_id?: string | null
          position_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_price_tiers: {
        Row: {
          created_at: string
          customer_group_label: string
          id: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_group_label: string
          id?: string
          price?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_group_label?: string
          id?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          acctivate_id: string | null
          base_price: number | null
          bc_product_id: string | null
          brand: string | null
          category: string | null
          collection: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          inventory_level: number | null
          is_active: boolean
          last_synced_at: string | null
          name: string | null
          sku: string
          stock_status: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          base_price?: number | null
          bc_product_id?: string | null
          brand?: string | null
          category?: string | null
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          inventory_level?: number | null
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          sku: string
          stock_status?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          base_price?: number | null
          bc_product_id?: string | null
          brand?: string | null
          category?: string | null
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          inventory_level?: number | null
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          sku?: string
          stock_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          eta: string | null
          id: string
          po_id: string | null
          qty_ordered: number
          qty_received: number
          sku: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          eta?: string | null
          id?: string
          po_id?: string | null
          qty_ordered?: number
          qty_received?: number
          sku: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          eta?: string | null
          id?: string
          po_id?: string | null
          qty_ordered?: number
          qty_received?: number
          sku?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          acctivate_id: string | null
          container_type: string | null
          created_at: string
          eta: string | null
          factory: string | null
          id: string
          is_prepaid: boolean
          last_synced_at: string | null
          order_date: string | null
          po_number: string | null
          prepaid_amount: number
          production_stage: string | null
          status: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          container_type?: string | null
          created_at?: string
          eta?: string | null
          factory?: string | null
          id?: string
          is_prepaid?: boolean
          last_synced_at?: string | null
          order_date?: string | null
          po_number?: string | null
          prepaid_amount?: number
          production_stage?: string | null
          status?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          container_type?: string | null
          created_at?: string
          eta?: string | null
          factory?: string | null
          id?: string
          is_prepaid?: boolean
          last_synced_at?: string | null
          order_date?: string | null
          po_number?: string | null
          prepaid_amount?: number
          production_stage?: string | null
          status?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      qb_customers: {
        Row: {
          balance: number | null
          bill_address: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          list_id: string
          name: string
          phone: string | null
          ship_address: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          bill_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          list_id: string
          name: string
          phone?: string | null
          ship_address?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          bill_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          list_id?: string
          name?: string
          phone?: string | null
          ship_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qb_invoice_lines: {
        Row: {
          amount: number | null
          created_at: string
          description: string | null
          id: string
          invoice_txn_id: string
          item_name: string | null
          line_number: number | null
          quantity: number | null
          rate: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_txn_id: string
          item_name?: string | null
          line_number?: number | null
          quantity?: number | null
          rate?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_txn_id?: string
          item_name?: string | null
          line_number?: number | null
          quantity?: number | null
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_invoice_lines_invoice_txn_id_fkey"
            columns: ["invoice_txn_id"]
            isOneToOne: false
            referencedRelation: "qb_invoices"
            referencedColumns: ["txn_id"]
          },
        ]
      }
      qb_invoices: {
        Row: {
          balance_remaining: number | null
          created_at: string
          customer_list_id: string | null
          customer_name: string | null
          due_date: string | null
          id: string
          is_paid: boolean | null
          last_synced_at: string | null
          memo: string | null
          ref_number: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          txn_date: string | null
          txn_id: string
          updated_at: string
        }
        Insert: {
          balance_remaining?: number | null
          created_at?: string
          customer_list_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          last_synced_at?: string | null
          memo?: string | null
          ref_number?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          txn_date?: string | null
          txn_id: string
          updated_at?: string
        }
        Update: {
          balance_remaining?: number | null
          created_at?: string
          customer_list_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          last_synced_at?: string | null
          memo?: string | null
          ref_number?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          txn_date?: string | null
          txn_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_invoices_customer_list_id_fkey"
            columns: ["customer_list_id"]
            isOneToOne: false
            referencedRelation: "qb_customers"
            referencedColumns: ["list_id"]
          },
        ]
      }
      qbwc_sync_log: {
        Row: {
          action: string | null
          finished_at: string | null
          id: string
          message: string | null
          rows_processed: number | null
          started_at: string
          status: string | null
          ticket: string | null
        }
        Insert: {
          action?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_processed?: number | null
          started_at?: string
          status?: string | null
          ticket?: string | null
        }
        Update: {
          action?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_processed?: number | null
          started_at?: string
          status?: string | null
          ticket?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name: string
          product_id: string | null
          qty: number
          quote_id: string
          sku: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          name: string
          product_id?: string | null
          qty?: number
          quote_id: string
          sku: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          quote_id?: string
          sku?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          dealer_id: string | null
          id: string
          notes: string | null
          status: string
          submitted_at: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rep_targets: {
        Row: {
          annual_target: number
          apr: number
          aug: number
          created_at: string
          created_by: string | null
          dec: number
          feb: number
          id: string
          jan: number
          jul: number
          jun: number
          mar: number
          may: number
          notes: string | null
          nov: number
          oct: number
          rep_id: string
          sep: number
          updated_at: string
          year: number
        }
        Insert: {
          annual_target?: number
          apr?: number
          aug?: number
          created_at?: string
          created_by?: string | null
          dec?: number
          feb?: number
          id?: string
          jan?: number
          jul?: number
          jun?: number
          mar?: number
          may?: number
          notes?: string | null
          nov?: number
          oct?: number
          rep_id: string
          sep?: number
          updated_at?: string
          year: number
        }
        Update: {
          annual_target?: number
          apr?: number
          aug?: number
          created_at?: string
          created_by?: string | null
          dec?: number
          feb?: number
          id?: string
          jan?: number
          jul?: number
          jun?: number
          mar?: number
          may?: number
          notes?: string | null
          nov?: number
          oct?: number
          rep_id?: string
          sep?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      rep_territories: {
        Row: {
          rep_id: string
          territory_id: string
        }
        Insert: {
          rep_id: string
          territory_id: string
        }
        Update: {
          rep_id?: string
          territory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_territories_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_territories_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          acctivate_id: string | null
          created_at: string
          email: string | null
          id: string
          kpi_score: number | null
          last_activity: string | null
          manager_id: string | null
          monday_id: string | null
          name: string
          phone: string | null
          quota: number | null
          revenue: number | null
          status: string
          tasks_completed: number | null
          tasks_overdue: number | null
          tasks_pending: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kpi_score?: number | null
          last_activity?: string | null
          manager_id?: string | null
          monday_id?: string | null
          name: string
          phone?: string | null
          quota?: number | null
          revenue?: number | null
          status?: string
          tasks_completed?: number | null
          tasks_overdue?: number | null
          tasks_pending?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kpi_score?: number | null
          last_activity?: string | null
          manager_id?: string | null
          monday_id?: string | null
          name?: string
          phone?: string | null
          quota?: number | null
          revenue?: number | null
          status?: string
          tasks_completed?: number | null
          tasks_overdue?: number | null
          tasks_pending?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_log: {
        Row: {
          id: string
          signed_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          signed_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          signed_in_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sku_sales_history: {
        Row: {
          created_at: string
          forecast_units: number | null
          id: string
          month: number
          revenue: number
          sku: string
          units_sold: number
          year: number
        }
        Insert: {
          created_at?: string
          forecast_units?: number | null
          id?: string
          month: number
          revenue?: number
          sku: string
          units_sold?: number
          year: number
        }
        Update: {
          created_at?: string
          forecast_units?: number | null
          id?: string
          month?: number
          revenue?: number
          sku?: string
          units_sold?: number
          year?: number
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_assignment_notifications_sent: {
        Row: {
          sent_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          sent_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          sent_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: []
      }
      task_board_groups: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_board_groups_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_board_members: {
        Row: {
          added_by: string
          board_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          added_by: string
          board_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          added_by?: string
          board_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          rep_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          rep_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          rep_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          acctivate_id: string | null
          created_at: string
          id: string
          kpi_score: number | null
          monday_id: string | null
          name: string
          quota: number | null
          region: string | null
          revenue: number | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          id?: string
          kpi_score?: number | null
          monday_id?: string | null
          name: string
          quota?: number | null
          region?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          id?: string
          kpi_score?: number | null
          monday_id?: string | null
          name?: string
          quota?: number | null
          region?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_show_leads: {
        Row: {
          additional_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          dealer: string | null
          email: string | null
          id: string
          lead_date: string | null
          market_id: string | null
          monday_item_id: string | null
          notes: string | null
          order_amount: number | null
          phone: string | null
          product_interest: string | null
          raw: Json | null
          rep_email: string | null
          sales_rep: string | null
          status: string | null
          trade_show: string | null
          updated_at: string
        }
        Insert: {
          additional_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          email?: string | null
          id?: string
          lead_date?: string | null
          market_id?: string | null
          monday_item_id?: string | null
          notes?: string | null
          order_amount?: number | null
          phone?: string | null
          product_interest?: string | null
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Update: {
          additional_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          email?: string | null
          id?: string
          lead_date?: string | null
          market_id?: string | null
          monday_item_id?: string | null
          notes?: string | null
          order_amount?: number | null
          phone?: string | null
          product_interest?: string | null
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_show_leads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "trade_show_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_show_markets: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          season: string | null
          start_date: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          season?: string | null
          start_date?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          season?: string | null
          start_date?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      travel_log: {
        Row: {
          approval_status: string | null
          created_at: string
          id: string
          manager_id: string | null
          monday_id: string | null
          notes: string | null
          purpose: string | null
          rep_id: string | null
          salesperson_name: string | null
          territory_id: string | null
          travel_date: string
          travel_end_date: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          monday_id?: string | null
          notes?: string | null
          purpose?: string | null
          rep_id?: string | null
          salesperson_name?: string | null
          territory_id?: string | null
          travel_date: string
          travel_end_date?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          monday_id?: string | null
          notes?: string | null
          purpose?: string | null
          rep_id?: string | null
          salesperson_name?: string | null
          territory_id?: string | null
          travel_date?: string
          travel_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_log_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_log_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_log_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dealers: {
        Row: {
          created_at: string
          dealer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_managers: {
        Row: {
          created_at: string
          manager_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          manager_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          manager_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_managers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reps: {
        Row: {
          created_at: string
          rep_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          rep_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          rep_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reps_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dealer_monthly_invoice_totals: {
        Row: {
          dealer_id: string | null
          invoiced: number | null
          invoiced_container: number | null
          invoiced_warehouse: number | null
          month: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_invoices_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _post_task_assigned_email: {
        Args: { _assigner_id: string; _task_id: string; _user_id: string }
        Returns: undefined
      }
      assignable_users: {
        Args: never
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      bookings_all_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          dealer_acctivate_id: string
          dealer_id: string
          extended_value: number
          order_date: string
        }[]
      }
      can_view_manager_task: { Args: { _task_id: string }; Returns: boolean }
      can_view_task_board: { Args: { _board_id: string }; Returns: boolean }
      current_dealer_id: { Args: never; Returns: string }
      current_manager_id: { Args: never; Returns: string }
      current_manager_rep_ids: { Args: never; Returns: string[] }
      current_rep_id: { Args: never; Returns: string }
      dealer_daily_invoice_net: {
        Args: { p_from: string; p_to: string }
        Returns: {
          dealer_id: string
          invoice_date: string
          net_total: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_customer_quote_by_token: {
        Args: { _token: string }
        Returns: {
          company_name: string
          contact_address: string
          contact_email: string
          contact_phone: string
          created_at: string
          customer_company: string
          customer_email: string
          customer_name: string
          dealer_user_id: string
          footer_message: string
          id: string
          intro_message: string
          items: Json
          logo_url: string
          sent_at: string
          status: string
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_manager: { Args: { _manager_id: string }; Returns: boolean }
      is_manager_task_creator: { Args: { _task_id: string }; Returns: boolean }
      is_staff_user: { Args: never; Returns: boolean }
      is_task_board_creator: { Args: { _board_id: string }; Returns: boolean }
      is_trade_show_task: { Args: { _task_id: string }; Returns: boolean }
      kpi_dealer_monthly_invoiced: {
        Args: { p_years: number[] }
        Returns: {
          dealer_id: string
          invoiced: number
          month: number
          year: number
        }[]
      }
      kpi_monthly_invoice_rollup: {
        Args: { p_dealer_ids?: string[]; p_years: number[] }
        Returns: {
          invoiced: number
          invoiced_container: number
          invoiced_warehouse: number
          month: number
          year: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_dealers_source_of_truth: { Args: never; Returns: Json }
      refresh_dealer_monthly_invoice_totals: { Args: never; Returns: undefined }
      user_id_for_manager: { Args: { _manager_id: string }; Returns: string }
      user_id_for_rep: { Args: { _rep_id: string }; Returns: string }
      user_id_for_rep_with_email_fallback: {
        Args: { _rep_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "rep" | "dealer"
      manager_task_status: "todo" | "in_progress" | "blocked" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "rep", "dealer"],
      manager_task_status: ["todo", "in_progress", "blocked", "done"],
    },
  },
} as const
