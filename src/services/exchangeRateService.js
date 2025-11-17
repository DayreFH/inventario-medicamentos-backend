import puppeteer from 'puppeteer';
import axios from 'axios';
import { prisma } from '../db.js';

class ExchangeRateService {
  constructor() {
    this.sources = {
      banco_central: this.scrapeBancoCentral.bind(this),
      api_externa: this.getFromExternalAPI.bind(this)
    };
  }

  /**
   * Webscraping del Banco Central de República Dominicana
   * Intenta obtener la tasa oficial DOP/USD
   */
  async scrapeBancoCentral() {
    let browser;
    try {
      console.log('Iniciando webscraping del Banco Central...');
      
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Intentar múltiples URLs del Banco Central
      const urls = [
        'https://www.bancentral.gov.do/SectorExterno/HistoricoTasas',
        'https://www.bancentral.gov.do/a/d/2547-tipo-de-cambio',
        'https://www.bancentral.gov.do/estadisticas-economicas/sector-externo/tipo-de-cambio',
        'https://www.bancentral.gov.do/estadisticas-economicas/sector-externo'
      ];

      for (const url of urls) {
        try {
          console.log(`Intentando obtener datos de: ${url}`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Intentar ubicar las cajas de tasas de cambio del BCRD
          const extracted = await page.evaluate(() => {
            const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
            const parseNum = (s) => {
              const m = s.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
              const n = parseFloat(m);
              return Number.isFinite(n) ? n : null;
            };

            // Buscar las cajas grises con las tasas USD Compra/Venta
            const boxes = Array.from(document.querySelectorAll('div, span, td, th')).filter(el => {
              const text = normalize(el.textContent);
              return text.includes('usd') && (text.includes('compra') || text.includes('venta'));
            });

            let buyRate = null, sellRate = null;

            for (const box of boxes) {
              const text = box.textContent;
              const numbers = text.match(/\d+\.?\d*/g);
              
              if (text.toLowerCase().includes('compra') && numbers) {
                const num = parseNum(numbers[0]);
                if (num && num > 50 && num < 100) {
                  buyRate = num;
                }
              }
              
              if (text.toLowerCase().includes('venta') && numbers) {
                const num = parseNum(numbers[0]);
                if (num && num > 50 && num < 100) {
                  sellRate = num;
                }
              }
            }

            // Si no encontramos las cajas específicas, buscar en tablas
            if (!buyRate || !sellRate) {
              const tables = Array.from(document.querySelectorAll('table'));
              for (const table of tables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                for (const row of rows) {
                  const cells = Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
                  const rowText = normalize(row.textContent);
                  
                  if (rowText.includes('usd') || rowText.includes('dólar') || rowText.includes('dolar')) {
                    const numbers = cells.map(parseNum).filter(v => v && v > 50 && v < 100);
                    if (numbers.length >= 2) {
                      buyRate = numbers[0];
                      sellRate = numbers[1];
                      break;
                    }
                  }
                }
                if (buyRate && sellRate) break;
              }
            }

            if (buyRate && sellRate) {
              return { 
                buyRate: buyRate, 
                sellRate: sellRate, 
                rate: (buyRate + sellRate) / 2 
              };
            }

            return null;
          });

          if (extracted && (extracted.rate || extracted.sellRate || extracted.buyRate)) {
            const { rate, buyRate, sellRate } = extracted;
            console.log(`Tasa encontrada BCRD: ref=${rate || sellRate || buyRate}, compra=${buyRate || 'n/d'}, venta=${sellRate || 'n/d'}`);
            return {
              fromCurrency: 'USD',
              toCurrency: 'DOP',
              rate: rate || sellRate || buyRate,
              buyRate: buyRate || null,
              sellRate: sellRate || null,
              source: 'banco_central',
              success: true
            };
          }
        } catch (error) {
          console.log(`Error en ${url}:`, error.message);
          continue;
        }
      }

      throw new Error('No se pudo obtener la tasa del Banco Central');
    } catch (error) {
      console.error('Error en webscraping del Banco Central:', error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Obtener tasa de cambio desde API externa como respaldo
   */
  async getFromExternalAPI() {
    try {
      console.log('Obteniendo tasa desde API externa...');
      
      // Usar una API gratuita como respaldo
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
        timeout: 10000
      });
      
      const dopRate = response.data.rates.DOP;
      
      if (dopRate && dopRate > 0) {
        console.log(`Tasa desde API externa: ${dopRate} DOP por USD`);
        return {
          fromCurrency: 'USD',
          toCurrency: 'DOP',
          rate: dopRate,
          buyRate: null,
          sellRate: null,
          source: 'api_externa',
          success: true
        };
      }
      
      throw new Error('Tasa no válida desde API externa');
    } catch (error) {
      console.error('Error obteniendo tasa desde API externa:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener la tasa de cambio usando múltiples fuentes
   */
  async getExchangeRate() {
    console.log('Obteniendo tasa de cambio DOP/USD...');
    
    // Intentar primero el Banco Central
    let result = await this.sources.banco_central();
    
    // Si falla, usar API externa como respaldo
    if (!result.success) {
      console.log('Banco Central falló, intentando API externa...');
      result = await this.sources.api_externa();
    }
    
    return result;
  }

  /**
   * Guardar la tasa de cambio en la base de datos
   */
  async saveExchangeRate(rateData) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Desactivar tasas anteriores del mismo día
      await prisma.exchangeRate.updateMany({
        where: {
          fromCurrency: rateData.fromCurrency,
          toCurrency: rateData.toCurrency,
          date: {
            gte: today
          }
        },
        data: {
          isActive: false
        }
      });

      // Crear nueva tasa
      const newRate = await prisma.exchangeRate.create({
        data: {
          fromCurrency: rateData.fromCurrency,
          toCurrency: rateData.toCurrency,
          rate: rateData.rate,
          buyRate: rateData.buyRate ?? null,
          sellRate: rateData.sellRate ?? null,
          source: rateData.source,
          date: today,
          isActive: true
        }
      });

      console.log(`Tasa guardada: ${newRate.rate} ${newRate.fromCurrency}/${newRate.toCurrency}`);
      return newRate;
    } catch (error) {
      console.error('Error guardando tasa de cambio:', error);
      throw error;
    }
  }

  /**
   * Obtener la tasa actual activa
   */
  async getCurrentRate(fromCurrency = 'USD', toCurrency = 'DOP') {
    try {
      const rate = await prisma.exchangeRate.findFirst({
        where: {
          fromCurrency,
          toCurrency,
          isActive: true
        },
        orderBy: {
          date: 'desc'
        }
      });

      return rate;
    } catch (error) {
      console.error('Error obteniendo tasa actual:', error);
      // Retornar una tasa de ejemplo si no hay base de datos
      return {
        id: 1,
        fromCurrency: 'USD',
        toCurrency: 'DOP',
        rate: 56.50,
        buyRate: 56.20,
        sellRate: 56.80,
        source: 'manual',
        date: new Date(),
        isActive: true
      };
    }
  }

  /**
   * Obtener historial de tasas
   */
  async getRateHistory(fromCurrency = 'USD', toCurrency = 'DOP', days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const rates = await prisma.exchangeRate.findMany({
        where: {
          fromCurrency,
          toCurrency,
          date: {
            gte: startDate
          }
        },
        orderBy: {
          date: 'desc'
        }
      });

      return rates;
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      // Retornar historial de ejemplo si no hay base de datos
      const today = new Date();
      return [
        {
          id: 1,
          fromCurrency: 'USD',
          toCurrency: 'DOP',
          rate: 56.50,
          buyRate: 56.20,
          sellRate: 56.80,
          source: 'manual',
          date: today,
          isActive: true,
          created_at: today
        }
      ];
    }
  }

  /**
   * Actualizar tasa manualmente
   */
  async updateRateManually(fromCurrency, toCurrency, rate, source = 'manual') {
    try {
      const rateData = {
        fromCurrency,
        toCurrency,
        rate: parseFloat(rate),
        source
      };

      return await this.saveExchangeRate(rateData);
    } catch (error) {
      console.error('Error actualizando tasa manualmente:', error);
      throw error;
    }
  }
}

export default new ExchangeRateService();
